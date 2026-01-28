import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';

export class LevelMetricsAggregationService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  /**
   * Aggregate level metrics for a specific day
   * Should be run daily via cron job for the previous day's data
   */
  async aggregateDailyMetrics(gameId: string, targetDate: Date): Promise<void> {
    try {
      const dateStr = targetDate.toISOString().split('T')[0];
      logger.info(`Starting daily aggregation for game ${gameId} on ${dateStr}`);

      // Set date boundaries (in UTC)
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

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
        }
      });

      logger.info(`Fetched ${events.length} level events for aggregation`);

      if (events.length === 0) {
        logger.info(`No events to aggregate for ${dateStr}`);
        return;
      }

      // Group events by all dimensions
      const groupedMetrics = this.groupEventsByDimensions(events, targetDate);

      // Upsert aggregated data
      let upsertCount = 0;
      for (const [_key, metrics] of groupedMetrics.entries()) {
        try {
          await (this.prisma as any).levelMetricsDaily.upsert({
          where: {
            unique_daily_metrics: {
              gameId,
              date: targetDate,
              levelId: metrics.levelId,
              levelFunnel: metrics.levelFunnel || '',
              levelFunnelVersion: metrics.levelFunnelVersion || 0,
              platform: metrics.platform || '',
              countryCode: metrics.countryCode || '',
              appVersion: metrics.appVersion || ''
            }
          },
          create: {
            gameId,
            date: targetDate,
            levelId: metrics.levelId,
            levelFunnel: metrics.levelFunnel,
            levelFunnelVersion: metrics.levelFunnelVersion,
            platform: metrics.platform,
            countryCode: metrics.countryCode,
            appVersion: metrics.appVersion,
            startedPlayers: metrics.startedPlayers,
            completedPlayers: metrics.completedPlayers,
            starts: metrics.starts,
            completes: metrics.completes,
            fails: metrics.fails,
            startedUserIds: Array.from(metrics.startedUserIds),
            completedUserIds: Array.from(metrics.completedUserIds),
            totalCompletionDuration: metrics.totalCompletionDuration,
            totalFailDuration: metrics.totalFailDuration,
            completionCount: metrics.completionCount,
            failCount: metrics.failCount,
            usersWithBoosters: metrics.usersWithBoosters,
            failsWithPurchase: metrics.failsWithPurchase
          },
          update: {
            startedPlayers: metrics.startedPlayers,
            completedPlayers: metrics.completedPlayers,
            starts: metrics.starts,
            completes: metrics.completes,
            fails: metrics.fails,
            startedUserIds: Array.from(metrics.startedUserIds),
            completedUserIds: Array.from(metrics.completedUserIds),
            totalCompletionDuration: metrics.totalCompletionDuration,
            totalFailDuration: metrics.totalFailDuration,
            completionCount: metrics.completionCount,
            failCount: metrics.failCount,
            usersWithBoosters: metrics.usersWithBoosters,
            failsWithPurchase: metrics.failsWithPurchase,
            updatedAt: new Date()
          }
          });

          upsertCount++;
        } catch (upsertError) {
          logger.warn(`Failed to upsert metric group: ${upsertError}`);
        }
      }

      logger.info(`Successfully aggregated ${upsertCount} metric groups for ${dateStr}`);
    } catch (error) {
      logger.error(`Error aggregating daily metrics for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Group events by all dimensions (level, platform, country, version, funnel)
   */
  private groupEventsByDimensions(
    events: any[],
    targetDate: Date
  ): Map<
    string,
    {
      levelId: number;
      levelFunnel?: string;
      levelFunnelVersion?: number;
      platform?: string;
      countryCode?: string;
      appVersion?: string;
      startedPlayers: number;
      completedPlayers: number;
      starts: number;
      completes: number;
      fails: number;
      startedUserIds: Set<string>;
      completedUserIds: Set<string>;
      usersWithBoostersSet?: Set<string>; // For tracking unique users with boosters
      failsWithPurchaseSet?: Set<string>; // For tracking unique users with purchases
      totalCompletionDuration: number;
      totalFailDuration: number;
      completionCount: number;
      failCount: number;
      usersWithBoosters: number;
      failsWithPurchase: number;
    }
  > {
    const groups = new Map();

    // First pass: extract level info from properties and track by user
    const startEventsByUser = new Map<string, any>();
    const eventsByLevel = new Map<string, any[]>();

    for (const event of events) {
      const props = event.properties as any;
      const levelId = props?.levelId;

      if (!levelId) continue;

      const key = `${levelId}:${event.levelFunnel || 'none'}:${event.levelFunnelVersion || 0}:${
        event.platform || 'none'
      }:${event.countryCode || 'none'}:${event.appVersion || 'none'}`;

      if (!groups.has(key)) {
        groups.set(key, {
          levelId,
          levelFunnel: event.levelFunnel,
          levelFunnelVersion: event.levelFunnelVersion,
          platform: event.platform,
          countryCode: event.countryCode,
          appVersion: event.appVersion,
          starts: 0,
          completes: 0,
          fails: 0,
          startedUserIds: new Set<string>(),
          completedUserIds: new Set<string>(),
          usersWithBoostersSet: new Set<string>(),
          failsWithPurchaseSet: new Set<string>(),
          totalCompletionDuration: 0,
          totalFailDuration: 0,
          completionCount: 0,
          failCount: 0,
          startedPlayers: 0,
          completedPlayers: 0,
          usersWithBoosters: 0,
          failsWithPurchase: 0
        });
      }

      const group = groups.get(key);

      // Track events
      if (event.eventName === 'level_start') {
        group.starts++;
        group.startedUserIds.add(event.userId);
        startEventsByUser.set(`${event.userId}:${levelId}`, event);
      } else if (event.eventName === 'level_complete') {
        group.completes++;
        group.completedUserIds.add(event.userId);

        // Calculate duration from matching start event
        const startKey = `${event.userId}:${levelId}`;
        const startEvent = startEventsByUser.get(startKey);
        if (startEvent) {
          const duration =
            (event.timestamp.getTime() - startEvent.timestamp.getTime()) / 1000;
          group.totalCompletionDuration += duration;
          group.completionCount++;
        }

        // Check for boosters - track unique users per group
        if (props?.boosters && Array.isArray(props.boosters) && props.boosters.length > 0) {
          if (!group.usersWithBoostersSet) {
            group.usersWithBoostersSet = new Set<string>();
          }
          group.usersWithBoostersSet.add(event.userId);
        }
      } else if (event.eventName === 'level_failed') {
        group.fails++;

        // Calculate duration from matching start event
        const startKey = `${event.userId}:${levelId}`;
        const startEvent = startEventsByUser.get(startKey);
        if (startEvent) {
          const duration =
            (event.timestamp.getTime() - startEvent.timestamp.getTime()) / 1000;
          group.totalFailDuration += duration;
          group.failCount++;
        }

        // Check for purchase after failure - track unique users per group
        if (props?.purchaseAfterFail || props?.madePurchaseAfterFail) {
          if (!group.failsWithPurchaseSet) {
            group.failsWithPurchaseSet = new Set<string>();
          }
          group.failsWithPurchaseSet.add(event.userId);
        }
      }
    }

    // Calculate unique user counts and convert Sets to counts
    for (const group of groups.values()) {
      group.startedPlayers = group.startedUserIds.size;
      group.completedPlayers = group.completedUserIds.size;
      group.usersWithBoosters = group.usersWithBoostersSet?.size || 0;
      group.failsWithPurchase = group.failsWithPurchaseSet?.size || 0;
    }

    return groups;
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
      let processedDays = 0;

      while (currentDate <= endDate) {
        await this.aggregateDailyMetrics(gameId, new Date(currentDate));
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

