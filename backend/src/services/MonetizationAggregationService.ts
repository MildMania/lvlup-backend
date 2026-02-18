import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';

export class MonetizationAggregationService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  async aggregateDaily(gameId: string, targetDate: Date): Promise<void> {
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    logger.info(`Aggregating monetization rollups for ${gameId} on ${dayStart.toISOString().split('T')[0]}`);

    await this.prisma.$executeRaw`
      INSERT INTO "monetization_daily_rollups"
        ("id","gameId","date","totalRevenueUsd","adRevenueUsd","iapRevenueUsd","adImpressionCount","iapCount","createdAt","updatedAt")
      SELECT
        concat('mdr_', md5(${gameId}::text || '|' || ${dayStart}::text)),
        ${gameId},
        ${dayStart},
        COALESCE(SUM(r."revenueUSD"),0)::double precision,
        COALESCE(SUM(r."revenueUSD") FILTER (WHERE r."revenueType" = 'AD_IMPRESSION'),0)::double precision,
        COALESCE(SUM(r."revenueUSD") FILTER (WHERE r."revenueType" = 'IN_APP_PURCHASE'),0)::double precision,
        COUNT(*) FILTER (WHERE r."revenueType" = 'AD_IMPRESSION')::int,
        COUNT(*) FILTER (WHERE r."revenueType" = 'IN_APP_PURCHASE')::int,
        now(),
        now()
      FROM "revenue" r
      WHERE r."gameId" = ${gameId}
        AND r."timestamp" >= ${dayStart}
        AND r."timestamp" < ${dayEnd}
      ON CONFLICT ("gameId","date")
      DO UPDATE SET
        "totalRevenueUsd" = EXCLUDED."totalRevenueUsd",
        "adRevenueUsd" = EXCLUDED."adRevenueUsd",
        "iapRevenueUsd" = EXCLUDED."iapRevenueUsd",
        "adImpressionCount" = EXCLUDED."adImpressionCount",
        "iapCount" = EXCLUDED."iapCount",
        "updatedAt" = now()
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "iap_payers" ("id","gameId","userId","firstSeen","createdAt","updatedAt")
      SELECT
        concat('iap_', md5(${gameId}::text || '|' || r."userId"::text)),
        ${gameId},
        r."userId",
        MIN(r."timestamp") AS "firstSeen",
        now(),
        now()
      FROM "revenue" r
      WHERE r."gameId" = ${gameId}
        AND r."revenueType" = 'IN_APP_PURCHASE'
        AND r."timestamp" >= ${dayStart}
        AND r."timestamp" < ${dayEnd}
      GROUP BY r."userId"
      ON CONFLICT ("gameId","userId") DO NOTHING
    `;
  }

  async aggregateHourlyIncrementForToday(gameId: string, hourStart: Date, hourEnd: Date): Promise<void> {
    const dayStart = new Date(hourEnd);
    dayStart.setUTCHours(0, 0, 0, 0);
    const boundedStart = hourStart > dayStart ? hourStart : dayStart;

    if (boundedStart >= hourEnd) {
      return;
    }

    logger.info(
      `Aggregating monetization hourly increment for ${gameId} window ${boundedStart.toISOString()} -> ${hourEnd.toISOString()}`
    );

    await this.prisma.$executeRaw`
      INSERT INTO "monetization_daily_rollups"
        ("id","gameId","date","totalRevenueUsd","adRevenueUsd","iapRevenueUsd","adImpressionCount","iapCount","createdAt","updatedAt")
      SELECT
        concat('mdr_', md5(${gameId}::text || '|' || ${dayStart}::text)),
        ${gameId},
        ${dayStart},
        COALESCE(SUM(r."revenueUSD"),0)::double precision,
        COALESCE(SUM(r."revenueUSD") FILTER (WHERE r."revenueType" = 'AD_IMPRESSION'),0)::double precision,
        COALESCE(SUM(r."revenueUSD") FILTER (WHERE r."revenueType" = 'IN_APP_PURCHASE'),0)::double precision,
        COUNT(*) FILTER (WHERE r."revenueType" = 'AD_IMPRESSION')::int,
        COUNT(*) FILTER (WHERE r."revenueType" = 'IN_APP_PURCHASE')::int,
        now(),
        now()
      FROM "revenue" r
      WHERE r."gameId" = ${gameId}
        AND r."timestamp" >= ${boundedStart}
        AND r."timestamp" < ${hourEnd}
      ON CONFLICT ("gameId","date")
      DO UPDATE SET
        "totalRevenueUsd" = "monetization_daily_rollups"."totalRevenueUsd" + EXCLUDED."totalRevenueUsd",
        "adRevenueUsd" = "monetization_daily_rollups"."adRevenueUsd" + EXCLUDED."adRevenueUsd",
        "iapRevenueUsd" = "monetization_daily_rollups"."iapRevenueUsd" + EXCLUDED."iapRevenueUsd",
        "adImpressionCount" = "monetization_daily_rollups"."adImpressionCount" + EXCLUDED."adImpressionCount",
        "iapCount" = "monetization_daily_rollups"."iapCount" + EXCLUDED."iapCount",
        "updatedAt" = now()
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "iap_payers" ("id","gameId","userId","firstSeen","createdAt","updatedAt")
      SELECT
        concat('iap_', md5(${gameId}::text || '|' || r."userId"::text)),
        ${gameId},
        r."userId",
        MIN(r."timestamp") AS "firstSeen",
        now(),
        now()
      FROM "revenue" r
      WHERE r."gameId" = ${gameId}
        AND r."revenueType" = 'IN_APP_PURCHASE'
        AND r."timestamp" >= ${boundedStart}
        AND r."timestamp" < ${hourEnd}
      GROUP BY r."userId"
      ON CONFLICT ("gameId","userId") DO NOTHING
    `;
  }

  async getGamesWithRevenue(): Promise<string[]> {
    const rows = await this.prisma.revenue.findMany({
      distinct: ['gameId'],
      select: { gameId: true },
      take: 1000
    });
    return rows.map((r) => r.gameId);
  }

  async backfill(gameId: string, startDate: Date, endDate: Date): Promise<void> {
    const cursor = new Date(startDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    while (cursor <= end) {
      await this.aggregateDaily(gameId, new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
}

export default new MonetizationAggregationService();
