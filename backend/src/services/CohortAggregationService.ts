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

      const cohorts = await this.getCohortSizesByDimensions(gameId, installDate, installEnd);
      if (cohorts.length === 0) continue;

      for (const cohort of cohorts) {
        const retention = await this.getRetentionAndCompletesByDimensions(
          gameId,
          installDate,
          installEnd,
          target,
          targetEnd,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion
        );
        await this.upsertRetention(
          gameId,
          installDate,
          dayIndex,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion,
          cohort.cohortSize,
          retention.retainedUsers,
          retention.retainedLevelCompletes
        );

        const sessionMetrics = await this.getSessionMetricsByDimensions(
          gameId,
          installDate,
          installEnd,
          target,
          targetEnd,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion
        );
        await this.upsertSessionMetrics(
          gameId,
          installDate,
          dayIndex,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion,
          cohort.cohortSize,
          sessionMetrics.sessionUsers,
          sessionMetrics.totalSessions,
          sessionMetrics.totalDurationSec
        );
      }
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

  private async getCohortSizesByDimensions(
    gameId: string,
    installStart: Date,
    installEnd: Date
  ): Promise<Array<{ platform: string; countryCode: string; appVersion: string; cohortSize: number }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ platform: string | null; countryCode: string | null; appVersion: string | null; count: bigint }>
    >(Prisma.sql`
      WITH cohort_users AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."gameId" = ${gameId}
          AND u."createdAt" >= ${installStart}
          AND u."createdAt" < ${installEnd}
      ),
      first_event AS (
        SELECT DISTINCT ON (e."userId")
          e."userId" AS "userId",
          e."platform" AS "platform",
          e."countryCode" AS "countryCode",
          e."appVersion" AS "appVersion"
        FROM "events" e
        JOIN cohort_users cu ON cu."id" = e."userId"
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= ${installStart}
          AND e."timestamp" < ${installEnd}
        ORDER BY e."userId", e."timestamp" ASC
      )
      SELECT
        COALESCE(f."platform",'') AS "platform",
        COALESCE(f."countryCode",'') AS "countryCode",
        COALESCE(f."appVersion",'') AS "appVersion",
        COUNT(*)::bigint AS "count"
      FROM cohort_users cu
      LEFT JOIN first_event f ON f."userId" = cu."id"
      GROUP BY 1,2,3
    `);

    return rows.map((row) => ({
      platform: row.platform || '',
      countryCode: row.countryCode || '',
      appVersion: row.appVersion || '',
      cohortSize: Number(row.count || 0)
    }));
  }

  private async getRetentionAndCompletesByDimensions(
    gameId: string,
    installStart: Date,
    installEnd: Date,
    targetStart: Date,
    targetEnd: Date,
    platform: string,
    countryCode: string,
    appVersion: string
  ): Promise<{ retainedUsers: number; retainedLevelCompletes: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ retained_users: bigint; retained_level_completes: bigint }>
    >(Prisma.sql`
      WITH cohort_users AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."gameId" = ${gameId}
          AND u."createdAt" >= ${installStart}
          AND u."createdAt" < ${installEnd}
      ),
      first_event AS (
        SELECT DISTINCT ON (e."userId")
          e."userId" AS "userId",
          e."platform" AS "platform",
          e."countryCode" AS "countryCode",
          e."appVersion" AS "appVersion"
        FROM "events" e
        JOIN cohort_users cu ON cu."id" = e."userId"
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= ${installStart}
          AND e."timestamp" < ${installEnd}
        ORDER BY e."userId", e."timestamp" ASC
      ),
      cohort AS (
        SELECT cu."id"
        FROM cohort_users cu
        LEFT JOIN first_event f ON f."userId" = cu."id"
        WHERE COALESCE(f."platform",'') = ${platform}
          AND COALESCE(f."countryCode",'') = ${countryCode}
          AND COALESCE(f."appVersion",'') = ${appVersion}
      ),
      retained AS (
        SELECT DISTINCT e."userId"
        FROM "events" e
        JOIN cohort c ON c."id" = e."userId"
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= ${targetStart}
          AND e."timestamp" < ${targetEnd}
      )
      SELECT
        (SELECT COUNT(*) FROM retained)::bigint AS "retained_users",
        (
          SELECT COUNT(*)::bigint
          FROM "events" e
          JOIN retained r ON r."userId" = e."userId"
          WHERE e."gameId" = ${gameId}
            AND e."eventName" = 'level_complete'
            AND e."timestamp" >= ${targetStart}
            AND e."timestamp" < ${targetEnd}
        ) AS "retained_level_completes"
    `);
    return {
      retainedUsers: Number(result[0]?.retained_users || 0),
      retainedLevelCompletes: Number(result[0]?.retained_level_completes || 0)
    };
  }

  private async getSessionMetricsByDimensions(
    gameId: string,
    installStart: Date,
    installEnd: Date,
    targetStart: Date,
    targetEnd: Date,
    platform: string,
    countryCode: string,
    appVersion: string
  ): Promise<{ sessionUsers: number; totalSessions: number; totalDurationSec: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ session_users: bigint; total_sessions: bigint; total_duration: bigint }>
    >(Prisma.sql`
      WITH cohort_users AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."gameId" = ${gameId}
          AND u."createdAt" >= ${installStart}
          AND u."createdAt" < ${installEnd}
      ),
      first_event AS (
        SELECT DISTINCT ON (e."userId")
          e."userId" AS "userId",
          e."platform" AS "platform",
          e."countryCode" AS "countryCode",
          e."appVersion" AS "appVersion"
        FROM "events" e
        JOIN cohort_users cu ON cu."id" = e."userId"
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= ${installStart}
          AND e."timestamp" < ${installEnd}
        ORDER BY e."userId", e."timestamp" ASC
      ),
      cohort AS (
        SELECT cu."id"
        FROM cohort_users cu
        LEFT JOIN first_event f ON f."userId" = cu."id"
        WHERE COALESCE(f."platform",'') = ${platform}
          AND COALESCE(f."countryCode",'') = ${countryCode}
          AND COALESCE(f."appVersion",'') = ${appVersion}
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
    platform: string,
    countryCode: string,
    appVersion: string,
    cohortSize: number,
    retainedUsers: number,
    retainedLevelCompletes: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "cohort_retention_daily"
        ("id","gameId","installDate","dayIndex","platform","countryCode","appVersion","cohortSize","retainedUsers","retainedLevelCompletes","createdAt","updatedAt")
      VALUES (
        ${this.buildId('crd', gameId, installDate, dayIndex, platform, countryCode, appVersion)},
        ${gameId},
        ${installDate},
        ${dayIndex},
        ${platform},
        ${countryCode},
        ${appVersion},
        ${cohortSize},
        ${retainedUsers},
        ${retainedLevelCompletes},
        now(),
        now()
      )
      ON CONFLICT ("gameId","installDate","dayIndex","platform","countryCode","appVersion")
      DO UPDATE SET
        "cohortSize" = EXCLUDED."cohortSize",
        "retainedUsers" = EXCLUDED."retainedUsers",
        "retainedLevelCompletes" = EXCLUDED."retainedLevelCompletes",
        "updatedAt" = now()
    `;
  }

  private async upsertSessionMetrics(
    gameId: string,
    installDate: Date,
    dayIndex: number,
    platform: string,
    countryCode: string,
    appVersion: string,
    cohortSize: number,
    sessionUsers: number,
    totalSessions: number,
    totalDurationSec: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "cohort_session_metrics_daily"
        ("id","gameId","installDate","dayIndex","platform","countryCode","appVersion","cohortSize","sessionUsers","totalSessions","totalDurationSec","createdAt","updatedAt")
      VALUES (
        ${this.buildId('csd', gameId, installDate, dayIndex, platform, countryCode, appVersion)},
        ${gameId},
        ${installDate},
        ${dayIndex},
        ${platform},
        ${countryCode},
        ${appVersion},
        ${cohortSize},
        ${sessionUsers},
        ${totalSessions},
        ${BigInt(totalDurationSec)},
        now(),
        now()
      )
      ON CONFLICT ("gameId","installDate","dayIndex","platform","countryCode","appVersion")
      DO UPDATE SET
        "cohortSize" = EXCLUDED."cohortSize",
        "sessionUsers" = EXCLUDED."sessionUsers",
        "totalSessions" = EXCLUDED."totalSessions",
        "totalDurationSec" = EXCLUDED."totalDurationSec",
        "updatedAt" = now()
    `;
  }

  private buildId(prefix: string, gameId: string, installDate: Date, dayIndex: number, platform: string, countryCode: string, appVersion: string): string {
    const date = installDate.toISOString().split('T')[0] || '';
    return `${prefix}_${gameId}_${date}_${dayIndex}_${platform}_${countryCode}_${appVersion}`;
  }
}

export default new CohortAggregationService();
