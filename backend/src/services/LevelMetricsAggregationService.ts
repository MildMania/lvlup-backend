import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';

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

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
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
    } catch (error) {
      logger.error(`Error aggregating daily metrics for game ${gameId}:`, error);
      throw error;
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
          countryCode: event.countryCode || '',
          appVersion: event.appVersion || '',
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
          countryCode: event.countryCode || '',
          appVersion: event.appVersion || ''
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
    return `${levelId}:${levelFunnel || ''}:${levelFunnelVersion || 0}:${platform || ''}:${countryCode || ''}:${appVersion || ''}`;
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
