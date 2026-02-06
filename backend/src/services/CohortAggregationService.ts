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

        const monetizationMetrics = await this.getMonetizationMetricsByDimensions(
          gameId,
          installDate,
          installEnd,
          target,
          targetEnd,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion
        );
        await this.upsertMonetizationMetrics(
          gameId,
          installDate,
          dayIndex,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion,
          monetizationMetrics.iapRevenueUsd,
          monetizationMetrics.adRevenueUsd,
          monetizationMetrics.totalRevenueUsd,
          monetizationMetrics.iapPayingUsers
        );
      }
    }
  }

  async aggregateHourlyRetentionUsersForToday(gameId: string, hourStart: Date, hourEnd: Date): Promise<void> {
    const targetDay = new Date(hourEnd);
    targetDay.setUTCHours(0, 0, 0, 0);
    const targetDayEnd = new Date(targetDay);
    targetDayEnd.setUTCDate(targetDayEnd.getUTCDate() + 1);

    logger.info(`Incremental cohort retention for ${gameId} at ${hourStart.toISOString()}`);

    // Insert unique retained users for this hour (exact, incremental)
    await this.prisma.$executeRaw`
      WITH hour_events AS (
        SELECT DISTINCT e."userId"
        FROM "events" e
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= ${hourStart}
          AND e."timestamp" < ${hourEnd}
          AND e."timestamp" >= ${targetDay}
          AND e."timestamp" < ${targetDayEnd}
      ),
      cohort_users AS (
        SELECT u."id" AS "userId",
               date_trunc('day', u."createdAt") AS "installDate"
        FROM "users" u
        JOIN hour_events h ON h."userId" = u."id"
        WHERE u."gameId" = ${gameId}
      ),
      first_event AS (
        SELECT DISTINCT ON (e."userId")
          e."userId" AS "userId",
          e."platform" AS "platform",
          e."countryCode" AS "countryCode",
          e."appVersion" AS "appVersion"
        FROM "events" e
        JOIN cohort_users cu ON cu."userId" = e."userId"
        WHERE e."gameId" = ${gameId}
          AND e."timestamp" >= cu."installDate"
          AND e."timestamp" < cu."installDate" + INTERVAL '1 day'
        ORDER BY e."userId", e."timestamp" ASC
      )
      INSERT INTO "cohort_retention_users_hourly"
        ("id","gameId","installDate","dayIndex","userId","platform","countryCode","appVersion","createdAt")
      SELECT
        concat('cruh_', md5(
          ${gameId}::text || '|' ||
          cu."installDate"::text || '|' ||
          EXTRACT(DAY FROM (date_trunc('day', ${targetDay}) - cu."installDate"))::text || '|' ||
          cu."userId"::text
        )) AS "id",
        ${gameId},
        cu."installDate",
        EXTRACT(DAY FROM (date_trunc('day', ${targetDay}) - cu."installDate"))::int AS "dayIndex",
        cu."userId",
        COALESCE(f."platform",'') AS "platform",
        COALESCE(f."countryCode",'') AS "countryCode",
        COALESCE(f."appVersion",'') AS "appVersion",
        now()
      FROM cohort_users cu
      LEFT JOIN first_event f ON f."userId" = cu."userId"
      WHERE EXTRACT(DAY FROM (date_trunc('day', ${targetDay}) - cu."installDate"))::int >= 0
      ON CONFLICT ("gameId","installDate","dayIndex","userId") DO NOTHING
    `;

    // Recompute retainedUsers for today's target day from hourly table and upsert daily rollup rows
    await this.prisma.$executeRaw`
      WITH counts AS (
        SELECT
          h."installDate" AS "installDate",
          h."dayIndex" AS "dayIndex",
          h."platform" AS "platform",
          h."countryCode" AS "countryCode",
          h."appVersion" AS "appVersion",
          COUNT(*)::int AS "retainedUsers"
        FROM "cohort_retention_users_hourly" h
        WHERE h."gameId" = ${gameId}
          AND h."installDate" + (h."dayIndex" || ' days')::interval = ${targetDay}
        GROUP BY 1,2,3,4,5
      ),
      cohort_sizes_today AS (
        WITH cohort_users AS (
          SELECT u."id"
          FROM "users" u
          WHERE u."gameId" = ${gameId}
            AND u."createdAt" >= ${targetDay}
            AND u."createdAt" < ${targetDayEnd}
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
            AND e."timestamp" >= ${targetDay}
            AND e."timestamp" < ${targetDayEnd}
          ORDER BY e."userId", e."timestamp" ASC
        )
        SELECT
          ${targetDay}::timestamptz AS "installDate",
          COALESCE(f."platform",'') AS "platform",
          COALESCE(f."countryCode",'') AS "countryCode",
          COALESCE(f."appVersion",'') AS "appVersion",
          COUNT(cu."id")::int AS "cohortSize"
        FROM cohort_users cu
        LEFT JOIN first_event f ON f."userId" = cu."id"
        GROUP BY 1,2,3,4
      ),
      cohort_sizes AS (
        SELECT "installDate","platform","countryCode","appVersion","cohortSize"
        FROM "cohort_retention_daily"
        WHERE "gameId" = ${gameId}
          AND "dayIndex" = 0
      ),
      merged AS (
        SELECT
          c."installDate",
          c."dayIndex",
          c."platform",
          c."countryCode",
          c."appVersion",
          c."retainedUsers",
          COALESCE(cs."cohortSize", cst."cohortSize", 0) AS "cohortSize"
        FROM counts c
        LEFT JOIN cohort_sizes cs
          ON cs."installDate" = c."installDate"
         AND cs."platform" = c."platform"
         AND cs."countryCode" = c."countryCode"
         AND cs."appVersion" = c."appVersion"
        LEFT JOIN cohort_sizes_today cst
          ON cst."installDate" = c."installDate"
         AND cst."platform" = c."platform"
         AND cst."countryCode" = c."countryCode"
         AND cst."appVersion" = c."appVersion"
      )
      INSERT INTO "cohort_retention_daily"
        ("id","gameId","installDate","dayIndex","platform","countryCode","appVersion","cohortSize","retainedUsers","retainedLevelCompletes","createdAt","updatedAt")
      SELECT
        concat('crd_', ${gameId}::text, '_', to_char(m."installDate",'YYYY-MM-DD'), '_', m."dayIndex"::text, '_', m."platform", '_', m."countryCode", '_', m."appVersion") AS "id",
        ${gameId},
        m."installDate",
        m."dayIndex",
        m."platform",
        m."countryCode",
        m."appVersion",
        m."cohortSize",
        m."retainedUsers",
        0,
        now(),
        now()
      FROM merged m
      ON CONFLICT ("gameId","installDate","dayIndex","platform","countryCode","appVersion")
      DO UPDATE SET
        "retainedUsers" = EXCLUDED."retainedUsers",
        "cohortSize" = CASE WHEN EXCLUDED."cohortSize" > 0 THEN EXCLUDED."cohortSize" ELSE "cohort_retention_daily"."cohortSize" END,
        "updatedAt" = now()
    `;

    // Keep only rows relevant to today to bound table size
    await this.prisma.$executeRaw`
      DELETE FROM "cohort_retention_users_hourly"
      WHERE "gameId" = ${gameId}
        AND "installDate" + ("dayIndex" || ' days')::interval < ${targetDay} - interval '1 day'
    `;

    await this.aggregateMonetizationForTargetDay(gameId, targetDay, COHORT_DAY_INDICES);
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

  private async getMonetizationMetricsByDimensions(
    gameId: string,
    installStart: Date,
    installEnd: Date,
    targetStart: Date,
    targetEnd: Date,
    platform: string,
    countryCode: string,
    appVersion: string
  ): Promise<{ iapRevenueUsd: number; adRevenueUsd: number; totalRevenueUsd: number; iapPayingUsers: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ iap_revenue_usd: number | null; ad_revenue_usd: number | null; total_revenue_usd: number | null; iap_paying_users: bigint }>
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
      )
      SELECT
        COALESCE(SUM(CASE WHEN r."revenueType" = 'IN_APP_PURCHASE' THEN COALESCE(r."revenueUSD", 0) ELSE 0 END), 0) AS "iap_revenue_usd",
        COALESCE(SUM(CASE WHEN r."revenueType" = 'AD_IMPRESSION' THEN COALESCE(r."revenueUSD", 0) ELSE 0 END), 0) AS "ad_revenue_usd",
        COALESCE(SUM(COALESCE(r."revenueUSD", 0)), 0) AS "total_revenue_usd",
        COUNT(DISTINCT CASE WHEN r."revenueType" = 'IN_APP_PURCHASE' THEN r."userId" END)::bigint AS "iap_paying_users"
      FROM "revenue" r
      JOIN cohort c ON c."id" = r."userId"
      WHERE r."gameId" = ${gameId}
        AND r."timestamp" >= ${targetStart}
        AND r."timestamp" < ${targetEnd}
    `);

    const row = result[0];
    return {
      iapRevenueUsd: Number(row?.iap_revenue_usd || 0),
      adRevenueUsd: Number(row?.ad_revenue_usd || 0),
      totalRevenueUsd: Number(row?.total_revenue_usd || 0),
      iapPayingUsers: Number(row?.iap_paying_users || 0)
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

  private async upsertMonetizationMetrics(
    gameId: string,
    installDate: Date,
    dayIndex: number,
    platform: string,
    countryCode: string,
    appVersion: string,
    iapRevenueUsd: number,
    adRevenueUsd: number,
    totalRevenueUsd: number,
    iapPayingUsers: number
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "cohort_monetization_daily"
        ("id","gameId","installDate","dayIndex","platform","countryCode","appVersion","iapRevenueUsd","adRevenueUsd","totalRevenueUsd","iapPayingUsers","createdAt","updatedAt")
      VALUES (
        ${this.buildId('cmd', gameId, installDate, dayIndex, platform, countryCode, appVersion)},
        ${gameId},
        ${installDate},
        ${dayIndex},
        ${platform},
        ${countryCode},
        ${appVersion},
        ${iapRevenueUsd},
        ${adRevenueUsd},
        ${totalRevenueUsd},
        ${iapPayingUsers},
        now(),
        now()
      )
      ON CONFLICT ("gameId","installDate","dayIndex","platform","countryCode","appVersion")
      DO UPDATE SET
        "iapRevenueUsd" = EXCLUDED."iapRevenueUsd",
        "adRevenueUsd" = EXCLUDED."adRevenueUsd",
        "totalRevenueUsd" = EXCLUDED."totalRevenueUsd",
        "iapPayingUsers" = EXCLUDED."iapPayingUsers",
        "updatedAt" = now()
    `;
  }

  private async aggregateMonetizationForTargetDay(
    gameId: string,
    targetDay: Date,
    dayIndices = COHORT_DAY_INDICES
  ): Promise<void> {
    const target = new Date(targetDay);
    target.setUTCHours(0, 0, 0, 0);
    const targetEnd = new Date(target);
    targetEnd.setUTCDate(targetEnd.getUTCDate() + 1);

    for (const dayIndex of dayIndices) {
      const installDate = new Date(target);
      installDate.setUTCDate(installDate.getUTCDate() - dayIndex);
      installDate.setUTCHours(0, 0, 0, 0);
      const installEnd = new Date(installDate);
      installEnd.setUTCDate(installEnd.getUTCDate() + 1);

      const cohorts = await this.getCohortSizesByDimensions(gameId, installDate, installEnd);
      if (cohorts.length === 0) continue;

      for (const cohort of cohorts) {
        const monetizationMetrics = await this.getMonetizationMetricsByDimensions(
          gameId,
          installDate,
          installEnd,
          target,
          targetEnd,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion
        );

        await this.upsertMonetizationMetrics(
          gameId,
          installDate,
          dayIndex,
          cohort.platform,
          cohort.countryCode,
          cohort.appVersion,
          monetizationMetrics.iapRevenueUsd,
          monetizationMetrics.adRevenueUsd,
          monetizationMetrics.totalRevenueUsd,
          monetizationMetrics.iapPayingUsers
        );
      }
    }
  }

  private buildId(prefix: string, gameId: string, installDate: Date, dayIndex: number, platform: string, countryCode: string, appVersion: string): string {
    const date = installDate.toISOString().split('T')[0] || '';
    return `${prefix}_${gameId}_${date}_${dayIndex}_${platform}_${countryCode}_${appVersion}`;
  }
}

export default new CohortAggregationService();
