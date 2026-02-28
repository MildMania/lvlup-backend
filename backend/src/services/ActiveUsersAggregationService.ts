import { PrismaClient } from '@prisma/client';
import { HLL, newHllId } from '../utils/hll';
import prisma from '../prisma';
import logger from '../utils/logger';
import { maybeThrottleAggregation } from '../utils/aggregationThrottle';

export class ActiveUsersAggregationService {
  private prisma: PrismaClient;
  private readonly batchSize = 50000;
  private readonly useChunkedDailyExactDau: boolean;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
    this.useChunkedDailyExactDau =
      process.env.ACTIVE_USERS_DAILY_CHUNKED !== '0' &&
      process.env.ACTIVE_USERS_DAILY_CHUNKED !== 'false';
  }

  async aggregateDailyActiveUsers(gameId: string, targetDate: Date): Promise<void> {
    const date = new Date(targetDate);
    date.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    logger.info(`Aggregating active users for ${gameId} on ${date.toISOString().split('T')[0]}`);

    if (this.useChunkedDailyExactDau) {
      await this.aggregateExactDailyDauChunked(gameId, dayStart, dayEnd);
    } else {
      // Legacy exact DAU rollups in one query (faster, potentially higher peak memory on DB side)
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO "active_users_daily"
          ("id","gameId","date","platform","countryCode","appVersion","dau","createdAt","updatedAt")
        SELECT
          concat('aud_', md5(
            e."gameId"::text || '|' ||
            date_trunc('day', e."timestamp")::text || '|' ||
            COALESCE(e."platform",'') || '|' ||
            COALESCE(e."countryCode",'') || '|' ||
            COALESCE(e."appVersion",'')
          )) as "id",
          e."gameId",
          date_trunc('day', e."timestamp")::timestamptz as "date",
          COALESCE(e."platform",'') as "platform",
          COALESCE(e."countryCode",'') as "countryCode",
          COALESCE(e."appVersion",'') as "appVersion",
          COUNT(DISTINCT e."userId") as "dau",
          now() as "createdAt",
          now() as "updatedAt"
        FROM "events" e
        WHERE e."gameId" = $1
          AND e."timestamp" >= $2
          AND e."timestamp" < $3
        GROUP BY
          e."gameId",
          date_trunc('day', e."timestamp"),
          COALESCE(e."platform",''),
          COALESCE(e."countryCode",''),
          COALESCE(e."appVersion",'')
        ON CONFLICT ("gameId","date","platform","countryCode","appVersion")
        DO UPDATE SET "dau" = EXCLUDED."dau", "updatedAt" = now()
        `,
        gameId,
        dayStart,
        dayEnd
      );
    }

    // HLL rollups for approximate WAU/MAU (computed in app, stored as BYTEA)
    const hllMap = new Map<string, {
      platform: string;
      countryCode: string;
      appVersion: string;
      hll: HLL;
    }>();
    let lastId: string | null = null;
    let processed = 0;

    while (true) {
      const rows: Array<{
        id: string;
        userId: string;
        platform: string | null;
        countryCode: string | null;
        appVersion: string | null;
      }> = await this.prisma.event.findMany({
        where: {
          gameId,
          timestamp: {
            gte: dayStart,
            lt: dayEnd
          },
          ...(lastId ? { id: { gt: lastId } } : {})
        },
        select: {
          id: true,
          userId: true,
          platform: true,
          countryCode: true,
          appVersion: true
        },
        orderBy: { id: 'asc' },
        take: this.batchSize
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const platform = row.platform || '';
        const countryCode = row.countryCode || '';
        const appVersion = row.appVersion || '';
        const key = `${platform}::${countryCode}::${appVersion}`;
        if (!hllMap.has(key)) {
          hllMap.set(key, { platform, countryCode, appVersion, hll: new HLL() });
        }
        hllMap.get(key)!.hll.add(row.userId);
      }

      processed += rows.length;
      const lastRow = rows[rows.length - 1];
      lastId = lastRow ? lastRow.id : null;
    }

    if (hllMap.size > 0) {
      for (const entry of hllMap.values()) {
        await this.prisma.$executeRaw`
          INSERT INTO "active_users_hll_daily"
            ("id","gameId","date","platform","countryCode","appVersion","hll","createdAt","updatedAt")
          VALUES (
            ${newHllId('auh')},
            ${gameId},
            ${dayStart},
            ${entry.platform},
            ${entry.countryCode},
            ${entry.appVersion},
            ${entry.hll.toBuffer()},
            now(),
            now()
          )
          ON CONFLICT ("gameId","date","platform","countryCode","appVersion")
          DO UPDATE SET "hll" = EXCLUDED."hll", "updatedAt" = now()
        `;
      }
    }
  }

  async backfillHistorical(gameId: string, startDate: Date, endDate: Date): Promise<void> {
    const current = new Date(startDate);
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    let processed = 0;
    while (current <= end) {
      await this.aggregateDailyActiveUsers(gameId, new Date(current));
      await maybeThrottleAggregation(`active-users-backfill-day:${gameId}`);
      current.setUTCDate(current.getUTCDate() + 1);
      processed++;

      if (processed % 10 === 0) {
        logger.info(`Active users backfill progress: ${processed} days processed`);
      }
    }

    logger.info(`Active users backfill complete: ${processed} days processed`);
  }

  async getGamesWithEvents(): Promise<string[]> {
    const results = await this.prisma.event.findMany({
      distinct: ['gameId'],
      select: { gameId: true },
      take: 1000
    });

    return results.map((r) => r.gameId);
  }

  private async aggregateExactDailyDauChunked(gameId: string, dayStart: Date, dayEnd: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "active_users_daily"
        WHERE "gameId" = ${gameId}
          AND "date" = ${dayStart}
      `;

      await tx.$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS "tmp_active_users_daily_dim_user" (
          "userId" text NOT NULL,
          "platform" text NOT NULL,
          "countryCode" text NOT NULL,
          "appVersion" text NOT NULL,
          PRIMARY KEY ("userId","platform","countryCode","appVersion")
        ) ON COMMIT DROP
      `;

      await tx.$executeRaw`TRUNCATE TABLE "tmp_active_users_daily_dim_user"`;

      const cursor = new Date(dayStart);
      while (cursor < dayEnd) {
        const next = new Date(cursor);
        next.setUTCHours(next.getUTCHours() + 1);

        await tx.$executeRaw`
          INSERT INTO "tmp_active_users_daily_dim_user" ("userId","platform","countryCode","appVersion")
          SELECT DISTINCT
            e."userId",
            COALESCE(e."platform",'') AS "platform",
            COALESCE(e."countryCode",'') AS "countryCode",
            COALESCE(e."appVersion",'') AS "appVersion"
          FROM "events" e
          WHERE e."gameId" = ${gameId}
            AND e."timestamp" >= ${cursor}
            AND e."timestamp" < ${next}
          ON CONFLICT ("userId","platform","countryCode","appVersion") DO NOTHING
        `;

        await maybeThrottleAggregation(`active-users-daily-chunk:${gameId}`);
        cursor.setUTCHours(cursor.getUTCHours() + 1);
      }

      await tx.$executeRaw`
        INSERT INTO "active_users_daily"
          ("id","gameId","date","platform","countryCode","appVersion","dau","createdAt","updatedAt")
        SELECT
          concat('aud_', md5(
            ${gameId}::text || '|' ||
            ${dayStart}::text || '|' ||
            t."platform" || '|' ||
            t."countryCode" || '|' ||
            t."appVersion"
          )) AS "id",
          ${gameId},
          ${dayStart},
          t."platform",
          t."countryCode",
          t."appVersion",
          COUNT(*)::int AS "dau",
          now(),
          now()
        FROM "tmp_active_users_daily_dim_user" t
        GROUP BY t."platform", t."countryCode", t."appVersion"
        ON CONFLICT ("gameId","date","platform","countryCode","appVersion")
        DO UPDATE SET "dau" = EXCLUDED."dau", "updatedAt" = now()
      `;
    });
  }
}

export default new ActiveUsersAggregationService();
