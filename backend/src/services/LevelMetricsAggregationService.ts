import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';
import { maybeThrottleAggregation } from '../utils/aggregationThrottle';

const CAN_SKIP_DUPLICATES = (process.env.DATABASE_URL || '').includes('postgres');

/**
 * Level Metrics Aggregation Service
 * 
 * Pre-aggregates daily level metrics to improve dashboard performance.
 * All calculations match the existing LevelFunnelService logic exactly.
 * 
 * Key principles:
 * - User IDs are used ONLY during aggregation (in-memory)
 * - Aggregated tables contain ONLY counts
 * - All metrics can be derived from aggregated counts
 * - Idempotent UPSERT operations
 */
export class LevelMetricsAggregationService {
  private prisma: PrismaClient;
  private readonly enableHourlyChurnRefresh: boolean;
  private readonly useChunkedDailyAggregation: boolean;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
    this.enableHourlyChurnRefresh = process.env.LEVEL_CHURN_HOURLY_REFRESH === '1';
    // Default to chunked daily processing to bound peak memory usage.
    // Set LEVEL_METRICS_DAILY_CHUNKED=0 to revert to legacy full-day in-memory scan.
    this.useChunkedDailyAggregation =
      process.env.LEVEL_METRICS_DAILY_CHUNKED !== '0' &&
      process.env.LEVEL_METRICS_DAILY_CHUNKED !== 'false';
  }

  /**
   * Level funnel rollups intentionally ignore country/appVersion to keep cardinality bounded.
   * We preserve platform + funnel + funnelVersion because they are used for analysis.
   */
  private normalizeLevelFunnelRollupCountryCode(_countryCode: string | null | undefined): string {
    return '';
  }

  private normalizeLevelFunnelRollupAppVersion(_appVersion: string | null | undefined): string {
    return '';
  }

  /**
   * Aggregate level metrics for a specific day
   * Should be run daily via cron job for the previous day's data
   */
  async aggregateDailyMetrics(gameId: string, targetDate: Date): Promise<void> {
    try {
      // Normalize date to UTC midnight
      const normalizedDate = new Date(targetDate);
      normalizedDate.setUTCHours(0, 0, 0, 0);
      
      const dateStr = normalizedDate.toISOString().split('T')[0];
      logger.info(`Starting daily aggregation for game ${gameId} on ${dateStr}`);

      // Set date boundaries (in UTC)
      const dayStart = new Date(normalizedDate);
      const dayEnd = new Date(normalizedDate);
      dayEnd.setUTCHours(23, 59, 59, 999);

      if (this.useChunkedDailyAggregation) {
        logger.info(
          `Using chunked daily aggregation for game ${gameId} on ${dateStr} (24 hourly windows)`
        );

        // Recompute this day from scratch (idempotent)
        await this.prisma.levelMetricsDailyUser.deleteMany({
          where: {
            gameId,
            date: normalizedDate
          }
        });
        await this.prisma.levelMetricsDaily.deleteMany({
          where: {
            gameId,
            date: normalizedDate
          }
        });

        // Process day in bounded hourly chunks to reduce memory pressure.
        const windowStart = new Date(dayStart);
        const dayExclusiveEnd = new Date(normalizedDate);
        dayExclusiveEnd.setUTCDate(dayExclusiveEnd.getUTCDate() + 1);

        while (windowStart < dayExclusiveEnd) {
          const windowEnd = new Date(windowStart);
          windowEnd.setUTCHours(windowEnd.getUTCHours() + 1);
          await this.aggregateHourlyMetricsIncremental(
            gameId,
            windowStart,
            windowEnd,
            { skipChurnRefresh: true }
          );
          await maybeThrottleAggregation(`level-metrics-daily-chunk:${gameId}:${dateStr}`);
          windowStart.setUTCHours(windowStart.getUTCHours() + 1);
        }

        await this.refreshLevelChurnCohortRollups(gameId, normalizedDate);
        logger.info(`Chunked daily aggregation completed for ${dateStr}`);
        return;
      }

      // Get all level events for this day
      const events = await this.prisma.event.findMany({
        where: {
          gameId,
          eventName: { in: ['level_start', 'level_complete', 'level_failed'] },
          timestamp: {
            gte: dayStart,
            lte: dayEnd
          }
        },
        select: {
          userId: true,
          eventName: true,
          timestamp: true,
          levelFunnel: true,
          levelFunnelVersion: true,
          platform: true,
          countryCode: true,
          appVersion: true,
          properties: true
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      logger.info(`Fetched ${events.length} level events for aggregation`);

      if (events.length === 0) {
        logger.info(`No events to aggregate for ${dateStr}`);
        return;
      }

      // Group events by all dimensions and aggregate
      const groupedMetrics = this.groupAndAggregateEvents(events);

      // Build daily unique user rows (exact) for multi-day accuracy
      const dailyUserRows = this.buildDailyUserRows(gameId, normalizedDate, events);

      // Replace daily user rows for this day (idempotent)
      try {
        await this.prisma.levelMetricsDailyUser.deleteMany({
          where: {
            gameId,
            date: normalizedDate
          }
        });

        if (dailyUserRows.length > 0) {
          const createManyArgs: any = { data: dailyUserRows };
          if (CAN_SKIP_DUPLICATES) {
            createManyArgs.skipDuplicates = true;
          }
          await this.prisma.levelMetricsDailyUser.createMany(createManyArgs);
        }
      } catch (userRowError) {
        logger.error(`Failed to upsert daily user rows for ${dateStr}:`, userRowError);
      }

      // Upsert aggregated data
      let upsertCount = 0;
      for (const [_key, metrics] of groupedMetrics.entries()) {
        try {
          await this.prisma.levelMetricsDaily.upsert({
            where: {
              unique_daily_metrics: {
                gameId,
                date: normalizedDate,
                levelId: metrics.levelId,
                levelFunnel: metrics.levelFunnel,
                levelFunnelVersion: metrics.levelFunnelVersion,
                platform: metrics.platform,
                countryCode: metrics.countryCode,
                appVersion: metrics.appVersion
              }
            },
            create: {
              gameId,
              date: normalizedDate,
              levelId: metrics.levelId,
              levelFunnel: metrics.levelFunnel,
              levelFunnelVersion: metrics.levelFunnelVersion,
              platform: metrics.platform,
              countryCode: metrics.countryCode,
              appVersion: metrics.appVersion,
              starts: metrics.starts,
              completes: metrics.completes,
              fails: metrics.fails,
              startedPlayers: metrics.startedPlayers,
              completedPlayers: metrics.completedPlayers,
              boosterUsers: metrics.boosterUsers,
              totalBoosterUsage: metrics.totalBoosterUsage,
              egpUsers: metrics.egpUsers,
              totalEgpUsage: metrics.totalEgpUsage,
              totalCompletionDuration: metrics.totalCompletionDuration,
              completionCount: metrics.completionCount,
              totalFailDuration: metrics.totalFailDuration,
              failCount: metrics.failCount
            },
            update: {
              starts: metrics.starts,
              completes: metrics.completes,
              fails: metrics.fails,
              startedPlayers: metrics.startedPlayers,
              completedPlayers: metrics.completedPlayers,
              boosterUsers: metrics.boosterUsers,
              totalBoosterUsage: metrics.totalBoosterUsage,
              egpUsers: metrics.egpUsers,
              totalEgpUsage: metrics.totalEgpUsage,
              totalCompletionDuration: metrics.totalCompletionDuration,
              completionCount: metrics.completionCount,
              totalFailDuration: metrics.totalFailDuration,
              failCount: metrics.failCount,
              updatedAt: new Date()
            }
          });

          upsertCount++;
        } catch (upsertError) {
          logger.error(`Failed to upsert metric group:`, upsertError);
        }
      }

      logger.info(`Successfully aggregated ${upsertCount} metric groups for ${dateStr}`);
      await this.refreshLevelChurnCohortRollups(gameId, normalizedDate);
    } catch (error) {
      logger.error(`Error aggregating daily metrics for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Incremental hourly aggregation for today's rolling window.
   * Updates only users/dimensions touched in the given window.
   */
  async aggregateHourlyMetricsIncremental(
    gameId: string,
    hourStart: Date,
    hourEnd: Date,
    options?: {
      skipChurnRefresh?: boolean;
    }
  ): Promise<void> {
    const dayStart = new Date(hourEnd);
    dayStart.setUTCHours(0, 0, 0, 0);
    const boundedStart = hourStart > dayStart ? hourStart : dayStart;

    if (boundedStart >= hourEnd) return;

    const hourEvents = await this.prisma.event.findMany({
      where: {
        gameId,
        eventName: { in: ['level_start', 'level_complete', 'level_failed'] },
        timestamp: {
          gte: boundedStart,
          lt: hourEnd
        }
      },
      select: {
        userId: true,
        eventName: true,
        timestamp: true,
        levelFunnel: true,
        levelFunnelVersion: true,
        platform: true,
        countryCode: true,
        appVersion: true,
        properties: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    if (hourEvents.length === 0) {
      return;
    }

    const touchedUserIds = Array.from(new Set(hourEvents.map((e) => e.userId)));
    const existingRows = await this.prisma.levelMetricsDailyUser.findMany({
      where: {
        gameId,
        date: dayStart,
        userId: { in: touchedUserIds }
      },
      select: {
        userId: true,
        levelId: true,
        levelFunnel: true,
        levelFunnelVersion: true,
        platform: true,
        countryCode: true,
        appVersion: true
      }
    });

    const canonicalDimensions = new Map<string, {
      levelId: number;
      levelFunnel: string;
      levelFunnelVersion: number;
      platform: string;
      countryCode: string;
      appVersion: string;
    }>();

    for (const row of existingRows) {
      const key = `${row.userId}:${row.levelId}`;
      if (!canonicalDimensions.has(key)) {
        canonicalDimensions.set(key, {
          levelId: row.levelId,
          levelFunnel: row.levelFunnel,
          levelFunnelVersion: row.levelFunnelVersion,
          platform: row.platform,
          countryCode: row.countryCode,
          appVersion: row.appVersion
        });
      }
    }

    const warmStartEvents = await this.prisma.event.findMany({
      where: {
        gameId,
        userId: { in: touchedUserIds },
        eventName: 'level_start',
        timestamp: {
          gte: dayStart,
          lt: boundedStart
        }
      },
      select: {
        userId: true,
        timestamp: true,
        properties: true
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    const startEventsByUser = new Map<string, Array<{ timestamp: Date }>>();
    for (const warmStart of warmStartEvents) {
      const props = warmStart.properties as any;
      const levelId = props?.levelId;
      if (levelId === undefined || levelId === null) continue;
      const userLevelKey = `${warmStart.userId}:${levelId}`;
      if (!startEventsByUser.has(userLevelKey)) {
        startEventsByUser.set(userLevelKey, []);
      }
      startEventsByUser.get(userLevelKey)!.push({ timestamp: warmStart.timestamp });
    }

    type HourlyUserRow = {
      levelId: number;
      levelFunnel: string;
      levelFunnelVersion: number;
      platform: string;
      countryCode: string;
      appVersion: string;
      userId: string;
      started: boolean;
      completed: boolean;
      boosterUsed: boolean;
      egpUsed: boolean;
      starts: number;
      completes: number;
      fails: number;
      totalCompletionDuration: bigint;
      completionCount: number;
      totalFailDuration: bigint;
      failCount: number;
    };

    const hourlyUserRows = new Map<string, HourlyUserRow>();
    const usageIncrements = new Map<string, { booster: number; egp: number }>();

    for (const event of hourEvents) {
      const props = event.properties as any;
      const levelId = props?.levelId;
      if (levelId === undefined || levelId === null) continue;

      const userLevelKey = `${event.userId}:${levelId}`;
      if (!canonicalDimensions.has(userLevelKey)) {
        canonicalDimensions.set(userLevelKey, {
          levelId,
          levelFunnel: event.levelFunnel || '',
          levelFunnelVersion: event.levelFunnelVersion || 0,
          platform: event.platform || '',
          countryCode: this.normalizeLevelFunnelRollupCountryCode(event.countryCode),
          appVersion: this.normalizeLevelFunnelRollupAppVersion(event.appVersion)
        });
      }

      const dims = canonicalDimensions.get(userLevelKey)!;
      const rowKey = `${dims.levelId}:${dims.levelFunnel}:${dims.levelFunnelVersion}:${dims.platform}:${dims.countryCode}:${dims.appVersion}:${event.userId}`;

      if (!hourlyUserRows.has(rowKey)) {
        hourlyUserRows.set(rowKey, {
          levelId: dims.levelId,
          levelFunnel: dims.levelFunnel,
          levelFunnelVersion: dims.levelFunnelVersion,
          platform: dims.platform,
          countryCode: dims.countryCode,
          appVersion: dims.appVersion,
          userId: event.userId,
          started: false,
          completed: false,
          boosterUsed: false,
          egpUsed: false,
          starts: 0,
          completes: 0,
          fails: 0,
          totalCompletionDuration: BigInt(0),
          completionCount: 0,
          totalFailDuration: BigInt(0),
          failCount: 0
        });
      }

      const row = hourlyUserRows.get(rowKey)!;
      const dimKey = `${dims.levelId}:${dims.levelFunnel}:${dims.levelFunnelVersion}:${dims.platform}:${dims.countryCode}:${dims.appVersion}`;

      if (event.eventName === 'level_start') {
        row.started = true;
        row.starts++;

        if (!startEventsByUser.has(userLevelKey)) {
          startEventsByUser.set(userLevelKey, []);
        }
        startEventsByUser.get(userLevelKey)!.push({ timestamp: event.timestamp });
      } else if (event.eventName === 'level_complete') {
        row.completed = true;
        row.completes++;
        const duration = this.findMatchingDuration(event, levelId, startEventsByUser as any);
        if (duration !== null) {
          row.totalCompletionDuration += BigInt(Math.floor(duration));
          row.completionCount++;
        }
      } else if (event.eventName === 'level_failed') {
        row.fails++;
        const duration = this.findMatchingDuration(event, levelId, startEventsByUser as any);
        if (duration !== null) {
          row.totalFailDuration += BigInt(Math.floor(duration));
          row.failCount++;
        }
      }

      if (event.eventName === 'level_complete' || event.eventName === 'level_failed') {
        if (props?.boosters && typeof props.boosters === 'object' && Object.keys(props.boosters).length > 0) {
          row.boosterUsed = true;
          const boosterCount = Object.values(props.boosters).reduce((sum: number, val: any) => {
            return sum + (typeof val === 'number' ? val : 0);
          }, 0);
          const currentUsage = usageIncrements.get(dimKey) || { booster: 0, egp: 0 };
          currentUsage.booster += boosterCount;
          usageIncrements.set(dimKey, currentUsage);
        }

        const egpValue = props?.egp ?? props?.endGamePurchase;
        if ((typeof egpValue === 'number' && egpValue > 0) || egpValue === true) {
          row.egpUsed = true;
          const egpCount = typeof egpValue === 'number' ? egpValue : 1;
          const currentUsage = usageIncrements.get(dimKey) || { booster: 0, egp: 0 };
          currentUsage.egp += egpCount;
          usageIncrements.set(dimKey, currentUsage);
        }
      }
    }

    const affectedDimensions = new Set<string>();

    for (const row of hourlyUserRows.values()) {
      await this.prisma.$executeRaw`
        INSERT INTO "level_metrics_daily_users"
          ("id","gameId","date","levelId","levelFunnel","levelFunnelVersion","platform","countryCode","appVersion","userId",
           "started","completed","boosterUsed","egpUsed","starts","completes","fails","totalCompletionDuration","completionCount","totalFailDuration","failCount","createdAt")
        VALUES (
          concat('lmdu_', md5(${gameId}::text || '|' || ${dayStart}::text || '|' || ${row.levelId}::text || '|' || ${row.levelFunnel} || '|' || ${row.levelFunnelVersion}::text || '|' || ${row.platform} || '|' || ${row.countryCode} || '|' || ${row.appVersion} || '|' || ${row.userId}::text)),
          ${gameId},
          ${dayStart},
          ${row.levelId},
          ${row.levelFunnel},
          ${row.levelFunnelVersion},
          ${row.platform},
          ${row.countryCode},
          ${row.appVersion},
          ${row.userId},
          ${row.started},
          ${row.completed},
          ${row.boosterUsed},
          ${row.egpUsed},
          ${row.starts},
          ${row.completes},
          ${row.fails},
          ${row.totalCompletionDuration},
          ${row.completionCount},
          ${row.totalFailDuration},
          ${row.failCount},
          now()
        )
        ON CONFLICT ("gameId","date","levelId","levelFunnel","levelFunnelVersion","platform","countryCode","appVersion","userId")
        DO UPDATE SET
          "started" = "level_metrics_daily_users"."started" OR EXCLUDED."started",
          "completed" = "level_metrics_daily_users"."completed" OR EXCLUDED."completed",
          "boosterUsed" = "level_metrics_daily_users"."boosterUsed" OR EXCLUDED."boosterUsed",
          "egpUsed" = "level_metrics_daily_users"."egpUsed" OR EXCLUDED."egpUsed",
          "starts" = "level_metrics_daily_users"."starts" + EXCLUDED."starts",
          "completes" = "level_metrics_daily_users"."completes" + EXCLUDED."completes",
          "fails" = "level_metrics_daily_users"."fails" + EXCLUDED."fails",
          "totalCompletionDuration" = "level_metrics_daily_users"."totalCompletionDuration" + EXCLUDED."totalCompletionDuration",
          "completionCount" = "level_metrics_daily_users"."completionCount" + EXCLUDED."completionCount",
          "totalFailDuration" = "level_metrics_daily_users"."totalFailDuration" + EXCLUDED."totalFailDuration",
          "failCount" = "level_metrics_daily_users"."failCount" + EXCLUDED."failCount"
      `;

      affectedDimensions.add(
        `${row.levelId}:${row.levelFunnel}:${row.levelFunnelVersion}:${row.platform}:${row.countryCode}:${row.appVersion}`
      );
    }

    for (const dimKey of affectedDimensions) {
      const [
        levelIdStr,
        levelFunnel = '',
        levelFunnelVersionStr = '0',
        platform = '',
        countryCode = '',
        appVersion = ''
      ] = dimKey.split(':');
      const levelId = Number(levelIdStr);
      const levelFunnelVersion = Number(levelFunnelVersionStr);

      const aggregates = await this.prisma.$queryRaw<
        Array<{
          starts: bigint;
          completes: bigint;
          fails: bigint;
          startedPlayers: bigint;
          completedPlayers: bigint;
          boosterUsers: bigint;
          egpUsers: bigint;
          totalCompletionDuration: bigint;
          completionCount: bigint;
          totalFailDuration: bigint;
          failCount: bigint;
        }>
      >`
        SELECT
          COALESCE(SUM("starts"), 0)::bigint AS "starts",
          COALESCE(SUM("completes"), 0)::bigint AS "completes",
          COALESCE(SUM("fails"), 0)::bigint AS "fails",
          COALESCE(COUNT(*) FILTER (WHERE "started" = true), 0)::bigint AS "startedPlayers",
          COALESCE(COUNT(*) FILTER (WHERE "completed" = true), 0)::bigint AS "completedPlayers",
          COALESCE(COUNT(*) FILTER (WHERE "boosterUsed" = true), 0)::bigint AS "boosterUsers",
          COALESCE(COUNT(*) FILTER (WHERE "egpUsed" = true), 0)::bigint AS "egpUsers",
          COALESCE(SUM("totalCompletionDuration"), 0)::bigint AS "totalCompletionDuration",
          COALESCE(SUM("completionCount"), 0)::bigint AS "completionCount",
          COALESCE(SUM("totalFailDuration"), 0)::bigint AS "totalFailDuration",
          COALESCE(SUM("failCount"), 0)::bigint AS "failCount"
        FROM "level_metrics_daily_users"
        WHERE "gameId" = ${gameId}
          AND "date" = ${dayStart}
          AND "levelId" = ${levelId}
          AND "levelFunnel" = ${levelFunnel}
          AND "levelFunnelVersion" = ${levelFunnelVersion}
          AND "platform" = ${platform}
          AND "countryCode" = ${countryCode}
          AND "appVersion" = ${appVersion}
      `;

      const row = aggregates[0];
      if (!row) continue;
      const usageIncrement = usageIncrements.get(dimKey) || { booster: 0, egp: 0 };

      await this.prisma.levelMetricsDaily.upsert({
        where: {
          unique_daily_metrics: {
            gameId,
            date: dayStart,
            levelId,
            levelFunnel,
            levelFunnelVersion,
            platform,
            countryCode,
            appVersion
          }
        },
        create: {
          gameId,
          date: dayStart,
          levelId,
          levelFunnel,
          levelFunnelVersion,
          platform,
          countryCode,
          appVersion,
          starts: Number(row.starts || 0),
          completes: Number(row.completes || 0),
          fails: Number(row.fails || 0),
          startedPlayers: Number(row.startedPlayers || 0),
          completedPlayers: Number(row.completedPlayers || 0),
          boosterUsers: Number(row.boosterUsers || 0),
          totalBoosterUsage: usageIncrement.booster,
          egpUsers: Number(row.egpUsers || 0),
          totalEgpUsage: usageIncrement.egp,
          totalCompletionDuration: row.totalCompletionDuration || BigInt(0),
          completionCount: Number(row.completionCount || 0),
          totalFailDuration: row.totalFailDuration || BigInt(0),
          failCount: Number(row.failCount || 0)
        },
        update: {
          starts: Number(row.starts || 0),
          completes: Number(row.completes || 0),
          fails: Number(row.fails || 0),
          startedPlayers: Number(row.startedPlayers || 0),
          completedPlayers: Number(row.completedPlayers || 0),
          boosterUsers: Number(row.boosterUsers || 0),
          totalBoosterUsage: {
            increment: usageIncrement.booster
          },
          egpUsers: Number(row.egpUsers || 0),
          totalEgpUsage: {
            increment: usageIncrement.egp
          },
          totalCompletionDuration: row.totalCompletionDuration || BigInt(0),
          completionCount: Number(row.completionCount || 0),
          totalFailDuration: row.totalFailDuration || BigInt(0),
          failCount: Number(row.failCount || 0),
          updatedAt: new Date()
        }
      });
    }

    if (!options?.skipChurnRefresh && this.enableHourlyChurnRefresh) {
      await this.refreshLevelChurnCohortRollups(gameId, dayStart);
    }
  }

  /**
   * Recompute level churn cohort rollups for cohort dates impacted by completions on `anchorDate`.
   * A completion on day D can affect completedByD7 for starter cohorts from D-7 through D.
   *
   * Additive-only rollup: reads level_metrics_daily_users + users and writes level_churn_cohort_daily.
   */
  private async refreshLevelChurnCohortRollups(gameId: string, anchorDate: Date): Promise<void> {
    const normalizedAnchor = new Date(anchorDate);
    normalizedAnchor.setUTCHours(0, 0, 0, 0);

    const cohortStart = new Date(normalizedAnchor);
    cohortStart.setUTCDate(cohortStart.getUTCDate() - 7);
    const cohortEnd = new Date(normalizedAnchor);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          DELETE FROM "level_churn_cohort_daily"
          WHERE "gameId" = ${gameId}
            AND "cohortDate" >= ${cohortStart}
            AND "cohortDate" <= ${cohortEnd}
        `;

        await tx.$executeRaw`
          WITH starter_rows AS (
            SELECT DISTINCT
              l."gameId",
              l."date"::date AS "cohortDate",
              date_trunc('day', u."createdAt")::date AS "installDate",
              l."levelId",
              l."levelFunnel",
              l."levelFunnelVersion",
              l."platform",
              ''::text AS "countryCode",
              ''::text AS "appVersion",
              l."userId"
            FROM "level_metrics_daily_users" l
            INNER JOIN "users" u
              ON u."id" = l."userId"
             AND u."gameId" = l."gameId"
            WHERE l."gameId" = ${gameId}
              AND l."started" = true
              AND l."date" >= ${cohortStart}
              AND l."date" <= ${cohortEnd}
          ),
          first_completion AS (
            SELECT
              l."gameId",
              l."levelId",
              l."levelFunnel",
              l."levelFunnelVersion",
              l."platform",
              l."userId",
              MIN(l."date"::date) AS "firstCompletionDate"
            FROM "level_metrics_daily_users" l
            WHERE l."gameId" = ${gameId}
              AND l."completed" = true
              AND l."date" >= ${cohortStart}
              AND l."date" <= (${cohortEnd}::date + INTERVAL '7 day')
            GROUP BY
              l."gameId",
              l."levelId",
              l."levelFunnel",
              l."levelFunnelVersion",
              l."platform",
              l."userId"
          ),
          joined AS (
            SELECT
              s."gameId",
              s."cohortDate",
              s."installDate",
              s."levelId",
              s."levelFunnel",
              s."levelFunnelVersion",
              s."platform",
              s."countryCode",
              s."appVersion",
              s."userId",
              fc."firstCompletionDate"
            FROM starter_rows s
            LEFT JOIN first_completion fc
              ON fc."gameId" = s."gameId"
             AND fc."levelId" = s."levelId"
             AND fc."levelFunnel" = s."levelFunnel"
             AND fc."levelFunnelVersion" = s."levelFunnelVersion"
             AND fc."platform" = s."platform"
             AND fc."userId" = s."userId"
          )
          INSERT INTO "level_churn_cohort_daily" (
            "id",
            "gameId",
            "cohortDate",
            "installDate",
            "levelId",
            "levelFunnel",
            "levelFunnelVersion",
            "platform",
            "countryCode",
            "appVersion",
            "starters",
            "completedByD0",
            "completedByD3",
            "completedByD7",
            "createdAt",
            "updatedAt"
          )
          SELECT
            concat(
              'lccd_',
              md5(
                j."gameId"::text || '|' ||
                j."cohortDate"::text || '|' ||
                j."installDate"::text || '|' ||
                j."levelId"::text || '|' ||
                j."levelFunnel" || '|' ||
                j."levelFunnelVersion"::text || '|' ||
                j."platform" || '|' ||
                j."countryCode" || '|' ||
                j."appVersion"
              )
            ) AS id,
            j."gameId",
            j."cohortDate"::timestamp,
            j."installDate"::timestamp,
            j."levelId",
            j."levelFunnel",
            j."levelFunnelVersion",
            j."platform",
            j."countryCode",
            j."appVersion",
            COUNT(*)::int AS "starters",
            COUNT(*) FILTER (
              WHERE j."firstCompletionDate" IS NOT NULL
                AND j."firstCompletionDate" >= j."cohortDate"
                AND j."firstCompletionDate" <= j."cohortDate"
            )::int AS "completedByD0",
            COUNT(*) FILTER (
              WHERE j."firstCompletionDate" IS NOT NULL
                AND j."firstCompletionDate" >= j."cohortDate"
                AND j."firstCompletionDate" <= (j."cohortDate" + 3)
            )::int AS "completedByD3",
            COUNT(*) FILTER (
              WHERE j."firstCompletionDate" IS NOT NULL
                AND j."firstCompletionDate" >= j."cohortDate"
                AND j."firstCompletionDate" <= (j."cohortDate" + 7)
            )::int AS "completedByD7",
            now(),
            now()
          FROM joined j
          GROUP BY
            j."gameId",
            j."cohortDate",
            j."installDate",
            j."levelId",
            j."levelFunnel",
            j."levelFunnelVersion",
            j."platform",
            j."countryCode",
            j."appVersion"
        `;
      });
    } catch (error) {
      logger.error('Failed to refresh level churn cohort rollups', {
        gameId,
        anchorDate: normalizedAnchor.toISOString(),
        error
      });
    }
  }

  /**
   * Group events by all dimensions and aggregate metrics
   * Matches the calculation logic from LevelFunnelService.calculateLevelMetrics()
   */
  private groupAndAggregateEvents(events: any[]): Map<string, {
    levelId: number;
    levelFunnel: string;
    levelFunnelVersion: number;
    platform: string;
    countryCode: string;
    appVersion: string;
    starts: number;
    completes: number;
    fails: number;
    startedPlayers: number;
    completedPlayers: number;
    startsFromCompletingUsers: number;
    boosterUsers: number;
    totalBoosterUsage: number;
    egpUsers: number;
    totalEgpUsage: number;
    totalCompletionDuration: bigint;
    completionCount: number;
    totalFailDuration: bigint;
    failCount: number;
  }> {
    const groups = new Map();

    // Build index of start events by user for duration calculation
    const startEventsByUser = new Map<string, any[]>();
    
    // Track first-seen dimensions per user per level to avoid cross-dimension duplication
    // Key: userId:levelId, Value: dimension key
    const userFirstDimensions = new Map<string, string>();
    
    for (const event of events) {
      const props = event.properties as any;
      const levelId = props?.levelId;

      if (levelId === undefined || levelId === null) continue;

      // Create dimension key for this event
      const eventDimensionKey = this.createDimensionKey(
        levelId,
        event.levelFunnel,
        event.levelFunnelVersion,
        event.platform,
        event.countryCode,
        event.appVersion
      );

      // Canonicalize dimensions: Use first-seen dimensions for this user+level
      const userLevelKey = `${event.userId}:${levelId}`;
      if (!userFirstDimensions.has(userLevelKey)) {
        // First time seeing this user for this level - record their dimensions
        userFirstDimensions.set(userLevelKey, eventDimensionKey);
      }
      
      // Get the canonical dimension key for this user+level (their first-seen dimensions)
      const key = userFirstDimensions.get(userLevelKey)!;

      // Initialize group if not exists
      if (!groups.has(key)) {
        groups.set(key, {
          levelId,
          levelFunnel: event.levelFunnel || '',
          levelFunnelVersion: event.levelFunnelVersion || 0,
          platform: event.platform || '',
          countryCode: this.normalizeLevelFunnelRollupCountryCode(event.countryCode),
          appVersion: this.normalizeLevelFunnelRollupAppVersion(event.appVersion),
          starts: 0,
          completes: 0,
          fails: 0,
          startedUserIds: new Set<string>(),
          completedUserIds: new Set<string>(),
          usersWithBoosters: new Set<string>(),
          usersWithEGP: new Set<string>(),
          totalBoosterUsage: 0,
          totalEgpUsage: 0,
          totalCompletionDuration: BigInt(0),
          completionCount: 0,
          totalFailDuration: BigInt(0),
          failCount: 0
        });
      }

      const group = groups.get(key);

      // Track start events for duration matching
      if (event.eventName === 'level_start') {
        const userKey = `${event.userId}:${levelId}`;
        if (!startEventsByUser.has(userKey)) {
          startEventsByUser.set(userKey, []);
        }
        startEventsByUser.get(userKey)!.push(event);
      }

      // Process event
      this.processEventForGroup(group, event, startEventsByUser);
    }

    // Convert Sets to counts and calculate apsRaw
    const result = new Map();
    for (const [key, group] of groups.entries()) {
      // Calculate starts from completing users (for apsRaw)
      // We need to track which start events came from users who completed
      const startsFromCompletingUsers = events.filter(e =>
        e.eventName === 'level_start' &&
        group.completedUserIds.has(e.userId) &&
        (e.properties as any)?.levelId === group.levelId
      ).length;
      
      result.set(key, {
        levelId: group.levelId,
        levelFunnel: group.levelFunnel,
        levelFunnelVersion: group.levelFunnelVersion,
        platform: group.platform,
        countryCode: group.countryCode,
        appVersion: group.appVersion,
        starts: group.starts,
        completes: group.completes,
        fails: group.fails,
        startedPlayers: group.startedUserIds.size,
        completedPlayers: group.completedUserIds.size,
        startsFromCompletingUsers: startsFromCompletingUsers,
        boosterUsers: group.usersWithBoosters.size,
        totalBoosterUsage: group.totalBoosterUsage,
        egpUsers: group.usersWithEGP.size,
        totalEgpUsage: group.totalEgpUsage,
        totalCompletionDuration: group.totalCompletionDuration,
        completionCount: group.completionCount,
        totalFailDuration: group.totalFailDuration,
        failCount: group.failCount
      });
    }

    return result;
  }

  /**
   * Build daily unique user rows (one row per user per day per dimension)
   * Used to compute exact multi-day unique users without raw scans.
   */
  private buildDailyUserRows(
    gameId: string,
    date: Date,
    events: any[]
  ): Array<{
    gameId: string;
    date: Date;
    levelId: number;
    levelFunnel: string;
    levelFunnelVersion: number;
    platform: string;
    countryCode: string;
    appVersion: string;
    userId: string;
    started: boolean;
    completed: boolean;
    boosterUsed: boolean;
    egpUsed: boolean;
    starts: number;
    completes: number;
    fails: number;
    totalCompletionDuration: bigint;
    completionCount: number;
    totalFailDuration: bigint;
    failCount: number;
  }> {
    const userLevelDimensions = new Map<string, {
      levelId: number;
      levelFunnel: string;
      levelFunnelVersion: number;
      platform: string;
      countryCode: string;
      appVersion: string;
    }>();

    // For duration matching, mirror the same start-event index used for aggregate metrics.
    // Keyed by `${userId}:${levelId}`.
    const startEventsByUser = new Map<string, any[]>();

    const userRows = new Map<string, {
      gameId: string;
      date: Date;
      levelId: number;
      levelFunnel: string;
      levelFunnelVersion: number;
      platform: string;
      countryCode: string;
      appVersion: string;
      userId: string;
      started: boolean;
      completed: boolean;
      boosterUsed: boolean;
      egpUsed: boolean;
      starts: number;
      completes: number;
      fails: number;
      totalCompletionDuration: bigint;
      completionCount: number;
      totalFailDuration: bigint;
      failCount: number;
    }>();

    for (const event of events) {
      const props = event.properties as any;
      const levelId = props?.levelId;
      if (levelId === undefined || levelId === null) continue;

      // Track start events for duration matching
      if (event.eventName === 'level_start') {
        const userKey = `${event.userId}:${levelId}`;
        if (!startEventsByUser.has(userKey)) startEventsByUser.set(userKey, []);
        startEventsByUser.get(userKey)!.push(event);
      }

      const userLevelKey = `${event.userId}:${levelId}`;
      if (!userLevelDimensions.has(userLevelKey)) {
        userLevelDimensions.set(userLevelKey, {
          levelId,
          levelFunnel: event.levelFunnel || '',
          levelFunnelVersion: event.levelFunnelVersion || 0,
          platform: event.platform || '',
          countryCode: this.normalizeLevelFunnelRollupCountryCode(event.countryCode),
          appVersion: this.normalizeLevelFunnelRollupAppVersion(event.appVersion)
        });
      }

      const dims = userLevelDimensions.get(userLevelKey)!;
      const rowKey = `${dims.levelId}:${dims.levelFunnel}:${dims.levelFunnelVersion}:${dims.platform}:${dims.countryCode}:${dims.appVersion}:${event.userId}`;

      if (!userRows.has(rowKey)) {
        userRows.set(rowKey, {
          gameId,
          date,
          levelId: dims.levelId,
          levelFunnel: dims.levelFunnel,
          levelFunnelVersion: dims.levelFunnelVersion,
          platform: dims.platform,
          countryCode: dims.countryCode,
          appVersion: dims.appVersion,
          userId: event.userId,
          started: false,
          completed: false,
          boosterUsed: false,
          egpUsed: false,
          starts: 0,
          completes: 0,
          fails: 0,
          totalCompletionDuration: BigInt(0),
          completionCount: 0,
          totalFailDuration: BigInt(0),
          failCount: 0
        });
      }

      const row = userRows.get(rowKey)!;

      if (event.eventName === 'level_start') {
        row.started = true;
        row.starts++;
      } else if (event.eventName === 'level_complete') {
        row.completed = true;
        row.completes++;

        const duration = this.findMatchingDuration(event, levelId, startEventsByUser);
        if (duration !== null) {
          row.totalCompletionDuration += BigInt(Math.floor(duration));
          row.completionCount++;
        }
      } else if (event.eventName === 'level_failed') {
        // No completion flag; keep as-is
        row.fails++;

        const duration = this.findMatchingDuration(event, levelId, startEventsByUser);
        if (duration !== null) {
          row.totalFailDuration += BigInt(Math.floor(duration));
          row.failCount++;
        }
      }

      // Booster usage
      if (event.eventName === 'level_complete' || event.eventName === 'level_failed') {
        if (props?.boosters && typeof props.boosters === 'object' && Object.keys(props.boosters).length > 0) {
          row.boosterUsed = true;
        }

        const egpValue = props?.egp ?? props?.endGamePurchase;
        if ((typeof egpValue === 'number' && egpValue > 0) || egpValue === true) {
          row.egpUsed = true;
        }
      }
    }

    return Array.from(userRows.values());
  }

  /**
   * Process a single event and update group metrics
   * Matches logic from LevelFunnelService.calculateLevelMetrics()
   */
  private processEventForGroup(group: any, event: any, startEventsByUser: Map<string, any[]>): void {
    const props = event.properties as any;
    const levelId = props?.levelId;

    if (event.eventName === 'level_start') {
      group.starts++;
      group.startedUserIds.add(event.userId);
    } 
    else if (event.eventName === 'level_complete') {
      group.completes++;
      group.completedUserIds.add(event.userId);

      // Calculate duration from matching start event
      const duration = this.findMatchingDuration(event, levelId, startEventsByUser);
      if (duration !== null) {
        group.totalCompletionDuration += BigInt(Math.floor(duration));
        group.completionCount++;
      }

      // Check for boosters (matches current logic: object with keys)
      if (props?.boosters && typeof props.boosters === 'object' && Object.keys(props.boosters).length > 0) {
        group.usersWithBoosters.add(event.userId);
        // Sum total booster usage (count values in the boosters object)
        const boosterCount = Object.values(props.boosters).reduce((sum: number, val: any) => {
          return sum + (typeof val === 'number' ? val : 0);
        }, 0);
        group.totalBoosterUsage += boosterCount;
      }

      // Check for EGP on complete events too (user may have revived and completed)
      const egpValue = props?.egp ?? props?.endGamePurchase;
      if ((typeof egpValue === 'number' && egpValue > 0) || egpValue === true) {
        group.usersWithEGP.add(event.userId);
        // Sum total EGP usage
        const egpCount = typeof egpValue === 'number' ? egpValue : 1;
        group.totalEgpUsage += egpCount;
      }
    } 
    else if (event.eventName === 'level_failed') {
      group.fails++;

      // Calculate duration from matching start event
      const duration = this.findMatchingDuration(event, levelId, startEventsByUser);
      if (duration !== null) {
        group.totalFailDuration += BigInt(Math.floor(duration));
        group.failCount++;
      }

      // Check for EGP (matches current logic: number > 0 or true)
      const egpValue = props?.egp ?? props?.endGamePurchase;
      if ((typeof egpValue === 'number' && egpValue > 0) || egpValue === true) {
        group.usersWithEGP.add(event.userId);
        // Sum total EGP usage
        const egpCount = typeof egpValue === 'number' ? egpValue : 1;
        group.totalEgpUsage += egpCount;
      }

      // Check for boosters on fail events too
      if (props?.boosters && typeof props.boosters === 'object' && Object.keys(props.boosters).length > 0) {
        group.usersWithBoosters.add(event.userId);
        // Sum total booster usage
        const boosterCount = Object.values(props.boosters).reduce((sum: number, val: any) => {
          return sum + (typeof val === 'number' ? val : 0);
        }, 0);
        group.totalBoosterUsage += boosterCount;
      }
    }
  }

  /**
   * Find the matching start event duration for a completion/fail event
   * Matches logic from LevelFunnelService.calculateDurations()
   */
  private findMatchingDuration(endEvent: any, levelId: number, startEventsByUser: Map<string, any[]>): number | null {
    const userKey = `${endEvent.userId}:${levelId}`;
    const starts = startEventsByUser.get(userKey);
    
    if (!starts || starts.length === 0) {
      return null;
    }

    // Find the most recent start before this end event
    const validStarts = starts.filter(s => s.timestamp <= endEvent.timestamp);
    if (validStarts.length === 0) {
      return null;
    }

    const closestStart = validStarts[validStarts.length - 1];
    const duration = (endEvent.timestamp.getTime() - closestStart.timestamp.getTime()) / 1000;
    
    return duration > 0 ? duration : null;
  }

  /**
   * Create a unique key for dimension grouping
   */
  private createDimensionKey(
    levelId: number,
    levelFunnel: string | null,
    levelFunnelVersion: number | null,
    platform: string | null,
    countryCode: string | null,
    appVersion: string | null
  ): string {
    return `${levelId}:${levelFunnel || ''}:${levelFunnelVersion || 0}:${platform || ''}:${this.normalizeLevelFunnelRollupCountryCode(countryCode)}:${this.normalizeLevelFunnelRollupAppVersion(appVersion)}`;
  }

  /**
   * Backfill historical data for a date range
   * Use this to populate the table with past data
   */
  async backfillHistorical(gameId: string, startDate: Date, endDate: Date): Promise<void> {
    try {
      logger.info(
        `Starting backfill for game ${gameId} from ${startDate.toISOString()} to ${endDate.toISOString()}`
      );

      const currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setUTCHours(0, 0, 0, 0);

      let processedDays = 0;

      while (currentDate <= end) {
        await this.aggregateDailyMetrics(gameId, new Date(currentDate));
        await maybeThrottleAggregation(`level-metrics-backfill-day:${gameId}`);
        currentDate.setDate(currentDate.getDate() + 1);
        processedDays++;

        // Log progress every 10 days
        if (processedDays % 10 === 0) {
          logger.info(`Backfill progress: ${processedDays} days processed`);
        }
      }

      logger.info(`Backfill complete: ${processedDays} days processed`);
    } catch (error) {
      logger.error(`Error during backfill for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Get all games that have level events
   */
  async getGamesWithLevelEvents(): Promise<string[]> {
    try {
      const results = await this.prisma.event.findMany({
        where: {
          eventName: { in: ['level_start', 'level_complete', 'level_failed'] }
        },
        distinct: ['gameId'],
        select: {
          gameId: true
        },
        take: 1000
      });

      return results.map((r) => r.gameId);
    } catch (error) {
      logger.error('Error getting games with level events:', error);
      throw error;
    }
  }
}

export default new LevelMetricsAggregationService();
