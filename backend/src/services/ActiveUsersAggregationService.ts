import { PrismaClient } from '@prisma/client';
import { HLL, newHllId } from '../utils/hll';
import prisma from '../prisma';
import logger from '../utils/logger';

export class ActiveUsersAggregationService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  async aggregateDailyActiveUsers(gameId: string, targetDate: Date): Promise<void> {
    const date = new Date(targetDate);
    date.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    logger.info(`Aggregating active users for ${gameId} on ${date.toISOString().split('T')[0]}`);

    // Exact DAU rollups
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

    // HLL rollups for approximate WAU/MAU (computed in app, stored as BYTEA)
    const rows = await this.prisma.event.findMany({
      where: {
        gameId,
        timestamp: {
          gte: dayStart,
          lt: dayEnd
        }
      },
      select: {
        userId: true,
        platform: true,
        countryCode: true,
        appVersion: true
      }
    });

    const hllMap = new Map<string, {
      platform: string;
      countryCode: string;
      appVersion: string;
      hll: HLL;
    }>();

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
}

export default new ActiveUsersAggregationService();
