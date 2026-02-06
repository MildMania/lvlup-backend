import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';

export const COHORT_DAY_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 14, 30, 60, 90, 180, 360, 540, 720];

export class CohortAggregationService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  async aggregateForDate(gameId: string, targetDate: Date, dayIndices = COHORT_DAY_INDICES): Promise<void> {
    const target = new Date(targetDate);
    target.setUTCHours(0, 0, 0, 0);
    const targetEnd = new Date(target);
    targetEnd.setUTCDate(targetEnd.getUTCDate() + 1);

    logger.info(`Aggregating cohort rollups for ${gameId} on ${target.toISOString().split('T')[0]}`);

    for (const dayIndex of dayIndices) {
      const installDate = new Date(target);
      installDate.setUTCDate(installDate.getUTCDate() - dayIndex);
      installDate.setUTCHours(0, 0, 0, 0);
      const installEnd = new Date(installDate);
      installEnd.setUTCDate(installEnd.getUTCDate() + 1);

      const cohortSize = await this.getCohortSize(gameId, installDate, installEnd);
      if (cohortSize === 0) continue;

      const retainedUsers = await this.getRetainedUsers(gameId, installDate, installEnd, target, targetEnd);
      await this.upsertRetention(gameId, installDate, dayIndex, cohortSize, retainedUsers);

      const sessionMetrics = await this.getSessionMetrics(gameId, installDate, installEnd, target, targetEnd);
      await this.upsertSessionMetrics(
        gameId,
        installDate,
        dayIndex,
        cohortSize,
        sessionMetrics.sessionUsers,
        sessionMetrics.totalSessions,
        sessionMetrics.totalDurationSec
      );
    }
  }

  async backfill(gameId: string, startDate: Date, endDate: Date, dayIndices = COHORT_DAY_INDICES): Promise<void> {
    const cursor = new Date(startDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    let processed = 0;
    while (cursor <= end) {
      await this.aggregateForDate(gameId, new Date(cursor), dayIndices);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      processed++;
      if (processed % 10 === 0) {
        logger.info(`Cohort rollup backfill progress: ${processed} days processed`);
      }
    }
  }

  async getGamesWithUsers(): Promise<string[]> {
    const results = await this.prisma.user.findMany({
      distinct: ['gameId'],
      select: { gameId: true },
      take: 1000
    });
    return results.map((r) => r.gameId);
  }

  private async getCohortSize(gameId: string, installStart: Date, installEnd: Date): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "users"
      WHERE "gameId" = ${gameId}
        AND "createdAt" >= ${installStart}
        AND "createdAt" < ${installEnd}
    `);
    return Number(result[0]?.count || 0);
  }

  private async getRetainedUsers(
    gameId: string,
    installStart: Date,
    installEnd: Date,
    targetStart: Date,
    targetEnd: Date
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT e."userId")::bigint AS "count"
      FROM "events" e
      JOIN "users" u ON u."id" = e."userId"
      WHERE e."gameId" = ${gameId}
        AND u."gameId" = ${gameId}
        AND u."createdAt" >= ${installStart}
        AND u."createdAt" < ${installEnd}
        AND e."timestamp" >= ${targetStart}
        AND e."timestamp" < ${targetEnd}
    `);
    return Number(result[0]?.count || 0);
  }

  private async getSessionMetrics(
    gameId: string,
    installStart: Date,
    installEnd: Date,
    targetStart: Date,
    targetEnd: Date
  ): Promise<{ sessionUsers: number; totalSessions: number; totalDurationSec: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ session_users: bigint; total_sessions: bigint; total_duration: bigint }>
    >(Prisma.sql`
      WITH cohort AS (
        SELECT "id"
        FROM "users"
        WHERE "gameId" = ${gameId}
          AND "createdAt" >= ${installStart}
          AND "createdAt" < ${installEnd}
      ),
      sessions_base AS (
        SELECT
          s."userId" AS "userId",
          CASE
            WHEN s."duration" IS NOT NULL AND s."duration" > 0 THEN s."duration"
            WHEN s."startTime" IS NOT NULL AND (s."lastHeartbeat" IS NOT NULL OR s."endTime" IS NOT NULL)
              THEN GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s."lastHeartbeat", s."endTime") - s."startTime")))
            ELSE 0
          END AS duration_sec
        FROM "sessions" s
        JOIN cohort c ON c."id" = s."userId"
        WHERE s."gameId" = ${gameId}
          AND s."startTime" >= ${targetStart}
          AND s."startTime" < ${targetEnd}
      )
      SELECT
        COUNT(*) FILTER (WHERE duration_sec > 0)::bigint AS "total_sessions",
        COUNT(DISTINCT "userId") FILTER (WHERE duration_sec > 0)::bigint AS "session_users",
        COALESCE(SUM(duration_sec), 0)::bigint AS "total_duration"
      FROM sessions_base
    `);

    const row = result[0];
    return {
      sessionUsers: Number(row?.session_users || 0),
      totalSessions: Number(row?.total_sessions || 0),
      totalDurationSec: Number(row?.total_duration || 0)
    };
  }

  private async upsertRetention(
    gameId: string,
    installDate: Date,
    dayIndex: number,
    cohortSize: number,
    retainedUsers: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "cohort_retention_daily"
        ("id","gameId","installDate","dayIndex","cohortSize","retainedUsers","createdAt","updatedAt")
      VALUES (
        ${this.buildId('crd', gameId, installDate, dayIndex)},
        ${gameId},
        ${installDate},
        ${dayIndex},
        ${cohortSize},
        ${retainedUsers},
        now(),
        now()
      )
      ON CONFLICT ("gameId","installDate","dayIndex")
      DO UPDATE SET
        "cohortSize" = EXCLUDED."cohortSize",
        "retainedUsers" = EXCLUDED."retainedUsers",
        "updatedAt" = now()
    `;
  }

  private async upsertSessionMetrics(
    gameId: string,
    installDate: Date,
    dayIndex: number,
    cohortSize: number,
    sessionUsers: number,
    totalSessions: number,
    totalDurationSec: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "cohort_session_metrics_daily"
        ("id","gameId","installDate","dayIndex","cohortSize","sessionUsers","totalSessions","totalDurationSec","createdAt","updatedAt")
      VALUES (
        ${this.buildId('csd', gameId, installDate, dayIndex)},
        ${gameId},
        ${installDate},
        ${dayIndex},
        ${cohortSize},
        ${sessionUsers},
        ${totalSessions},
        ${BigInt(totalDurationSec)},
        now(),
        now()
      )
      ON CONFLICT ("gameId","installDate","dayIndex")
      DO UPDATE SET
        "cohortSize" = EXCLUDED."cohortSize",
        "sessionUsers" = EXCLUDED."sessionUsers",
        "totalSessions" = EXCLUDED."totalSessions",
        "totalDurationSec" = EXCLUDED."totalDurationSec",
        "updatedAt" = now()
    `;
  }

  private buildId(prefix: string, gameId: string, installDate: Date, dayIndex: number): string {
    const date = installDate.toISOString().split('T')[0] || '';
    return `${prefix}_${gameId}_${date}_${dayIndex}`;
  }
}

export default new CohortAggregationService();
