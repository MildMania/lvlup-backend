import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';

interface LevelFunnelFilters {
    gameId: string;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    country?: string | undefined;
    platform?: string | undefined;
    version?: string | undefined;
    abTestId?: string | undefined;
    variantId?: string | undefined; // For filtering by specific AB test variant
    levelFunnel?: string | undefined; // e.g., "live_v1"
    levelFunnelVersion?: number | undefined; // e.g., 1, 2, 3
    levelLimit?: number | undefined; // Maximum number of levels to return (default: 100)
}

interface LevelMetrics {
    levelId: number;
    levelName?: string;
    startedPlayers: number;
    completedPlayers: number;
    starts: number;
    completes: number;
    fails: number;
    winRate: number; // (Completed levels / (Completed + Failed levels)) × 100 - excludes users who only started
    completionRate: number; // (unique players completed / unique players started) × 100
    failRate: number;
    funnelRate: number; // (Nth level completed users / 1st level started users) × 100
    churnTotal: number; // Total churn rate
    churnStartComplete: number;
    churnCompleteNext: number;
    apsRaw: number; // All starts from completing users (includes orphaned starts)
    apsClean: number; // Only starts with matching conclusions (filters out orphaned starts)
    meanCompletionDuration: number;
    meanFailDuration: number;
    cumulativeAvgTime: number; // Cumulative average time from level 1 to current level
    boosterUsage: number;
    egpRate: number;
    customMetrics: Record<string, any>;
}

export class LevelFunnelService {

    /**
     * Get level funnel data using pre-aggregated metrics (FAST!)
     * This queries the LevelMetricsDaily table instead of raw events
     * ~40x faster than getLevelFunnelData()
     */
    async getLevelFunnelDataFast(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        const queryStart = Date.now();
        try {
            const { gameId, startDate, endDate, country, platform, version, levelFunnel, levelFunnelVersion, levelLimit = 100 } = filters;

            logger.info(`Starting FAST level funnel query for game ${gameId}`, {
                startDate: startDate?.toISOString(),
                endDate: endDate?.toISOString(),
                country,
                platform,
                version,
                levelFunnel,
                levelFunnelVersion,
                levelLimit
            });

            // Build where clause for pre-aggregated metrics
            const whereClause: any = {
                gameId,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            };

            // Add optional filters
            if (country) {
                whereClause.countryCode = Array.isArray(country)
                    ? { in: country.split(',').map(c => c.trim()) }
                    : country;
            }
            if (platform) {
                whereClause.platform = Array.isArray(platform)
                    ? { in: platform.split(',').map(p => p.trim()) }
                    : platform;
            }
            if (version) {
                whereClause.appVersion = Array.isArray(version)
                    ? { in: version.split(',').map(v => v.trim()) }
                    : version;
            }
            if (levelFunnel) {
                whereClause.levelFunnel = levelFunnel;
            }
            if (levelFunnelVersion) {
                whereClause.levelFunnelVersion = levelFunnelVersion;
            }

            // Query pre-aggregated data
            const aggregatedMetrics = await prisma.levelMetricsDaily.findMany({
                where: whereClause,
                orderBy: { levelId: 'asc' }
            });

            const queryDuration = Date.now() - queryStart;
            logger.info(`FAST query completed in ${queryDuration}ms, fetched ${aggregatedMetrics.length} aggregated metric rows`);

            if (aggregatedMetrics.length === 0) {
                logger.info('No aggregated metrics found, returning empty result');
                return [];
            }

            // Group aggregated data by level and sum across days
            const levelMetricsMap = new Map<number, LevelMetrics>();

            for (const metric of aggregatedMetrics) {
                if (!levelMetricsMap.has(metric.levelId)) {
                    levelMetricsMap.set(metric.levelId, {
                        levelId: metric.levelId,
                        startedPlayers: 0,
                        completedPlayers: 0,
                        starts: 0,
                        completes: 0,
                        fails: 0,
                        winRate: 0,
                        completionRate: 0,
                        failRate: 0,
                        funnelRate: 0,
                        churnTotal: 0,
                        churnStartComplete: 0,
                        churnCompleteNext: 0,
                        apsRaw: 0,
                        apsClean: 0,
                        meanCompletionDuration: 0,
                        meanFailDuration: 0,
                        cumulativeAvgTime: 0,
                        boosterUsage: 0,
                        egpRate: 0,
                        customMetrics: {}
                    });
                }

                const levelMetric = levelMetricsMap.get(metric.levelId)!;
                
                // Sum metrics across all days/dimensions
                levelMetric.starts += metric.starts;
                levelMetric.completes += metric.completes;
                levelMetric.fails += metric.fails;

                // Merge user IDs (these are arrays in the DB)
                const startedUserIds = new Set<string>(
                    [...(levelMetric.customMetrics.startedUserIds || []), ...(metric.startedUserIds || [])]
                );
                const completedUserIds = new Set<string>(
                    [...(levelMetric.customMetrics.completedUserIds || []), ...(metric.completedUserIds || [])]
                );

                levelMetric.customMetrics.startedUserIds = Array.from(startedUserIds);
                levelMetric.customMetrics.completedUserIds = Array.from(completedUserIds);
                levelMetric.startedPlayers = startedUserIds.size;
                levelMetric.completedPlayers = completedUserIds.size;

                // Accumulate duration data
                levelMetric.customMetrics.totalCompletionDuration =
                    (levelMetric.customMetrics.totalCompletionDuration || 0) + metric.totalCompletionDuration;
                levelMetric.customMetrics.completionCount =
                    (levelMetric.customMetrics.completionCount || 0) + metric.completionCount;
                levelMetric.customMetrics.totalFailDuration =
                    (levelMetric.customMetrics.totalFailDuration || 0) + metric.totalFailDuration;
                levelMetric.customMetrics.failCount =
                    (levelMetric.customMetrics.failCount || 0) + metric.failCount;

                // Booster/EGP tracking
                levelMetric.customMetrics.usersWithBoosters =
                    (levelMetric.customMetrics.usersWithBoosters || 0) + metric.usersWithBoosters;
                levelMetric.customMetrics.failsWithPurchase =
                    (levelMetric.customMetrics.failsWithPurchase || 0) + metric.failsWithPurchase;
            }

            // Calculate final metrics
            const levelMetrics: LevelMetrics[] = [];
            let firstLevelCompletedUsers = 0;

            for (const [levelId, metric] of levelMetricsMap) {
                if (levelId === 1) {
                    firstLevelCompletedUsers = metric.completedPlayers;
                }
            }

            for (const [levelId, metric] of levelMetricsMap) {
                // Calculate rates
                const totalConclusions = metric.completes + metric.fails;
                metric.winRate = totalConclusions > 0 ? (metric.completes / totalConclusions) * 100 : 0;
                metric.completionRate = metric.startedPlayers > 0 ? (metric.completedPlayers / metric.startedPlayers) * 100 : 0;
                metric.failRate = totalConclusions > 0 ? (metric.fails / totalConclusions) * 100 : 0;
                metric.funnelRate = firstLevelCompletedUsers > 0 ? (metric.completedPlayers / firstLevelCompletedUsers) * 100 : 0;
                metric.churnStartComplete = metric.startedPlayers > 0 ? ((metric.startedPlayers - metric.completedPlayers) / metric.startedPlayers) * 100 : 0;

                // Duration metrics
                const completionCount = metric.customMetrics.completionCount || 0;
                const failCount = metric.customMetrics.failCount || 0;
                metric.meanCompletionDuration = completionCount > 0 ? metric.customMetrics.totalCompletionDuration / completionCount : 0;
                metric.meanFailDuration = failCount > 0 ? metric.customMetrics.totalFailDuration / failCount : 0;

                // Booster usage percentage
                metric.boosterUsage = metric.completedPlayers > 0 ? (metric.customMetrics.usersWithBoosters / metric.completedPlayers) * 100 : 0;

                // EGP rate
                metric.egpRate = metric.fails > 0 ? (metric.customMetrics.failsWithPurchase / metric.fails) * 100 : 0;

                // APS metrics (approximated from aggregates)
                metric.apsRaw = metric.completedPlayers > 0 ? metric.starts / metric.completedPlayers : 0;
                metric.apsClean = metric.completedPlayers > 0 ? metric.completes / metric.completedPlayers : 0;

                levelMetrics.push(metric);
            }

            // Sort by level ID and apply limit
            levelMetrics.sort((a, b) => a.levelId - b.levelId);
            const limitedMetrics = levelMetrics.slice(0, levelLimit);

            // Calculate cumulative time
            let cumulativeTime = 0;
            for (const metric of limitedMetrics) {
                cumulativeTime += metric.meanCompletionDuration;
                metric.cumulativeAvgTime = Math.round(cumulativeTime * 100) / 100;
            }

            const totalDuration = Date.now() - queryStart;
            logger.info(`FAST level funnel processing completed in ${totalDuration}ms`);

            return limitedMetrics;
        } catch (error) {
            const errorDuration = Date.now() - queryStart;
            logger.error(`Error in getLevelFunnelDataFast after ${errorDuration}ms:`, error);
            throw error;
        }
    }

    /**
     * Determine which query method to use based on data freshness
     * - Recent data (last few days): Use real-time query
     * - Historical data: Use pre-aggregated metrics
     */
    async getLevelFunnelDataHybrid(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        const daysSinceStart = filters.startDate
            ? (Date.now() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24)
            : 0;

        // If querying today or yesterday, use real-time query for accuracy
        if (daysSinceStart < 2) {
            logger.info('Using real-time query for recent data');
            return this.getLevelFunnelData(filters);
        }

        // Use pre-aggregated data for historical queries
        logger.info('Using fast pre-aggregated query for historical data');
        return this.getLevelFunnelDataFast(filters);
    }

    /**
     * Get level funnel data with all metrics
     */
    async getLevelFunnelData(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        try {
            const { gameId, startDate, endDate, country, platform, version, abTestId, variantId, levelFunnel, levelFunnelVersion, levelLimit = 100 } = filters;

            // Build where clause for filtering
            const whereClause: any = {
                gameId,
                eventName: {
                    in: ['level_start', 'level_complete', 'level_failed']
                }
            };

            if (startDate) {
                whereClause.timestamp = { ...whereClause.timestamp, gte: startDate };
            }
            if (endDate) {
                whereClause.timestamp = { ...whereClause.timestamp, lte: endDate };
            }
            if (country) {
                // Support multiple countries (comma-separated)
                const countries = country.split(',').map(c => c.trim()).filter(c => c);
                if (countries.length > 1) {
                    whereClause.countryCode = { in: countries };
                } else if (countries.length === 1) {
                    whereClause.countryCode = countries[0];
                }
            }
            if (platform) {
                // Support multiple platforms (comma-separated)
                const platforms = platform.split(',').map(p => p.trim()).filter(p => p);
                if (platforms.length > 1) {
                    whereClause.platform = { in: platforms };
                } else if (platforms.length === 1) {
                    whereClause.platform = platforms[0];
                }
            }
            if (version) {
                // Support multiple versions (comma-separated)
                const versions = version.split(',').map(v => v.trim()).filter(v => v);
                if (versions.length > 1) {
                    whereClause.appVersion = { in: versions };
                } else if (versions.length === 1) {
                    whereClause.appVersion = versions[0];
                }
            }

            // Filter by level funnel combinations (exact funnel + version pairs)
            if (levelFunnel && levelFunnelVersion) {
                const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
                const versions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                
                // Build OR conditions for exact funnel+version pairs
                if (funnels.length > 0 && versions.length > 0 && funnels.length === versions.length) {
                    if (funnels.length === 1) {
                        // Single funnel pair - direct assignment
                        whereClause.levelFunnel = funnels[0];
                        whereClause.levelFunnelVersion = versions[0];
                    } else {
                        // Multiple funnel pairs - need to filter in code since Prisma doesn't support complex OR well
                        // Just get all events and filter after
                        const allFunnels = [...new Set(funnels)];
                        const allVersions = [...new Set(versions)];
                        
                        if (allFunnels.length > 0) {
                            whereClause.levelFunnel = { in: allFunnels };
                        }
                        if (allVersions.length > 0) {
                            whereClause.levelFunnelVersion = { in: allVersions };
                        }
                    }
                }
            } else if (levelFunnel) {
                // Only funnel specified, no version
                const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
                if (funnels.length > 1) {
                    whereClause.levelFunnel = { in: funnels };
                } else if (funnels.length === 1) {
                    whereClause.levelFunnel = funnels[0];
                }
            } else if (levelFunnelVersion) {
                // Only version specified, no funnel
                const versions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                if (versions.length > 1) {
                    whereClause.levelFunnelVersion = { in: versions };
                } else if (versions.length === 1) {
                    whereClause.levelFunnelVersion = versions[0];
                }
            }

            // NEW APPROACH: Filter by AB test data embedded in event
            // Much faster than querying TestAssignment and doing IN clause
            if (abTestId && variantId) {
                // PostgreSQL: Use JSON operator to filter
                // SQLite: Will need to filter in memory (for dev only)
                whereClause.abTests = {
                    path: [abTestId],
                    equals: variantId
                };
            }

            // Performance optimization: Log query start
            const queryStart = Date.now();
            logger.info(`Starting level funnel query for game ${gameId} with filters:`, {
                startDate: startDate?.toISOString(),
                endDate: endDate?.toISOString(),
                country,
                platform,
                version,
                levelFunnel,
                levelFunnelVersion,
                levelLimit
            });

            // Get all level events
            let events = await prisma.event.findMany({
                where: whereClause,
                select: {
                    id: true,
                    userId: true,
                    eventName: true,
                    properties: true,
                    timestamp: true,
                    levelFunnel: true,
                    levelFunnelVersion: true
                },
                orderBy: {
                    timestamp: 'asc'
                }
            });

            const queryDuration = Date.now() - queryStart;
            logger.info(`Level funnel query completed in ${queryDuration}ms, fetched ${events.length} events`);

            // Post-filter for exact funnel+version pairs when multiple selected
            if (levelFunnel && levelFunnelVersion) {
                const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
                const versions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                
                // Apply post-filter when we have multiple selections (even if same funnel name)
                if (funnels.length > 0 && versions.length > 0 && funnels.length === versions.length && (funnels.length > 1 || versions.length > 1)) {
                    // Create set of valid funnel+version combinations
                    const validCombinations = new Set(
                        funnels.map((funnel, idx) => `${funnel}:${versions[idx]}`)
                    );
                    
                    // Filter events to only include exact pairs
                    events = events.filter(event => {
                        const key = `${(event as any).levelFunnel}:${(event as any).levelFunnelVersion}`;
                        return validCombinations.has(key);
                    });
                }
            }

            // Group events by level
            const levelGroups = this.groupEventsByLevel(events);

            // Calculate metrics for each level
            const levelMetrics: LevelMetrics[] = [];
            // Sort level IDs and filter out any undefined values
            const levelIds = Array.from(levelGroups.keys())
                .filter((id): id is number => id !== undefined && id !== null)
                .sort((a, b) => a - b);

            // Get first level started users count for funnel rate calculation
            let firstLevelStartedUsers = 0;
            if (levelIds.length > 0) {
                const firstLevelId = levelIds[0];
                if (firstLevelId !== undefined) {
                    const firstLevelEvents = levelGroups.get(firstLevelId);
                    if (firstLevelEvents) {
                        const firstLevelStarts = firstLevelEvents.filter(e => e.eventName === 'level_start');
                        firstLevelStartedUsers = new Set(firstLevelStarts.map(e => e.userId)).size;
                    }
                }
            }

            // Apply level limit (default 100)
            const limitedLevelIds = levelIds.slice(0, levelLimit);
            logger.info(`Processing ${limitedLevelIds.length} levels out of ${levelIds.length} total (limit: ${levelLimit})`);

            const metricsStart = Date.now();
            for (let i = 0; i < limitedLevelIds.length; i++) {
                const levelId = limitedLevelIds[i]!; // Non-null assertion since we filtered
                const nextLevelId: number | null = i < limitedLevelIds.length - 1 ? limitedLevelIds[i + 1]! : null;
                
                const metrics = await this.calculateLevelMetrics(
                    levelId,
                    levelGroups.get(levelId)!,
                    nextLevelId !== null ? levelGroups.get(nextLevelId) : undefined,
                    firstLevelStartedUsers
                );
                
                levelMetrics.push(metrics);
            }
            const metricsDuration = Date.now() - metricsStart;
            logger.info(`Metrics calculation completed in ${metricsDuration}ms for ${limitedLevelIds.length} levels`);

            // Calculate cumulative average time for each level
            let cumulativeTime = 0;
            for (let i = 0; i < levelMetrics.length; i++) {
                const metric = levelMetrics[i];
                if (metric) {
                    cumulativeTime += metric.meanCompletionDuration;
                    metric.cumulativeAvgTime = Math.round(cumulativeTime * 100) / 100;
                }
            }

            const totalDuration = Date.now() - queryStart;
            logger.info(`Total level funnel processing completed in ${totalDuration}ms`);

            return levelMetrics;
        } catch (error) {
            logger.error('Error in getLevelFunnelData:', error);
            throw error;
        }
    }

    /**
     * Group events by levelId
     */
    private groupEventsByLevel(events: any[]): Map<number, any[]> {
        const groups = new Map<number, any[]>();

        for (const event of events) {
            const props = event.properties as any;
            const levelId = props?.levelId;

            if (levelId !== undefined && levelId !== null && typeof levelId === 'number') {
                if (!groups.has(levelId)) {
                    groups.set(levelId, []);
                }
                groups.get(levelId)!.push(event);
            }
        }

        return groups;
    }

    /**
     * Calculate all metrics for a specific level
     */
    private async calculateLevelMetrics(
        levelId: number,
        events: any[],
        nextLevelEvents?: any[],
        firstLevelStartedUsers?: number
    ): Promise<LevelMetrics> {
        // Separate events by type
        const startEvents = events.filter(e => e.eventName === 'level_start');
        const completeEvents = events.filter(e => e.eventName === 'level_complete');
        const failEvents = events.filter(e => e.eventName === 'level_failed');

        // Basic counts
        const uniquePlayers = new Set(events.map(e => e.userId)).size;
        const totalStarts = startEvents.length;
        const totalCompletes = completeEvents.length;
        const totalFails = failEvents.length;

        // Get unique users for each event type
        const usersWhoStarted = new Set(startEvents.map(e => e.userId));
        const usersWhoCompleted = new Set(completeEvents.map(e => e.userId));
        const usersWhoFailed = new Set(failEvents.map(e => e.userId));

        // Started Players: unique users who triggered level_start
        const startedPlayers = usersWhoStarted.size;
        
        // Completed Players: unique users who triggered level_complete
        const completedPlayers = usersWhoCompleted.size;

        // Win Rate: (Completed levels / (Completed + Failed levels)) × 100
        // This excludes users who only started but never completed or failed
        const totalConclusions = totalCompletes + totalFails;
        const winRate = totalConclusions > 0 ? (totalCompletes / totalConclusions) * 100 : 0;

        // Completion Rate: (unique players completed / unique players started) × 100
        const completionRate = startedPlayers > 0 ? (completedPlayers / startedPlayers) * 100 : 0;

        // Fail Rate: (Fail events / (Completed + Failed levels)) × 100
        // This also excludes users who only started
        const failRate = totalConclusions > 0 ? (totalFails / totalConclusions) * 100 : 0;

        // Funnel Rate: (Nth level completed users / 1st level started users) × 100
        const funnelRate = firstLevelStartedUsers && firstLevelStartedUsers > 0
            ? (completedPlayers / firstLevelStartedUsers) * 100
            : 0;

        // Churn (Start-Complete): % of users who started but never completed
        const churnStartComplete = usersWhoStarted.size > 0
            ? ((usersWhoStarted.size - usersWhoCompleted.size) / usersWhoStarted.size) * 100
            : 0;

        // Churn (Complete-Next): % of users who completed this level but didn't start next
        let churnCompleteNext = 0;
        let nextLevelStarters = new Set<string>();
        if (nextLevelEvents) {
            nextLevelStarters = new Set(
                nextLevelEvents
                    .filter(e => e.eventName === 'level_start')
                    .map(e => e.userId)
            );
            
            churnCompleteNext = usersWhoCompleted.size > 0
                ? ((usersWhoCompleted.size - nextLevelStarters.size) / usersWhoCompleted.size) * 100
                : 0;
        }

        // Churn Total: Total users lost (didn't complete + completed but didn't continue) as % of started users
        // This is: (users who never completed + users who completed but didn't start next) / started users
        const usersWhoDidntComplete = usersWhoStarted.size - usersWhoCompleted.size;
        const usersWhoCompletedButDidntContinue = nextLevelEvents 
            ? usersWhoCompleted.size - nextLevelStarters.size
            : 0;
        const churnTotal = usersWhoStarted.size > 0
            ? ((usersWhoDidntComplete + usersWhoCompletedButDidntContinue) / usersWhoStarted.size) * 100
            : 0;

        // APS (Attempts Per Success): Two different calculations
        
        // 1. Raw APS: All starts from completing users (includes orphaned starts from crashes, etc.)
        const allStartsFromCompletedUsers = startEvents.filter(e => usersWhoCompleted.has(e.userId)).length;
        const apsRaw = usersWhoCompleted.size > 0
            ? allStartsFromCompletedUsers / usersWhoCompleted.size
            : 0;
        
        // 2. Clean APS: Only starts that have a corresponding conclusion (complete or fail)
        // This filters out orphaned start events from crashes, network issues, etc.
        const matchedStarts = this.matchStartsWithConclusions(startEvents, [...completeEvents, ...failEvents]);
        const matchedStartsFromCompletedUsers = matchedStarts.filter(match => 
            usersWhoCompleted.has(match.userId)
        ).length;
        const apsClean = usersWhoCompleted.size > 0
            ? matchedStartsFromCompletedUsers / usersWhoCompleted.size
            : 0;

        // Mean Completion Duration
        const completionDurations = this.calculateDurations(startEvents, completeEvents);
        const meanCompletionDuration = completionDurations.length > 0
            ? completionDurations.reduce((sum, d) => sum + d, 0) / completionDurations.length
            : 0;

        // Mean Fail Duration
        const failDurations = this.calculateDurations(startEvents, failEvents);
        const meanFailDuration = failDurations.length > 0
            ? failDurations.reduce((sum, d) => sum + d, 0) / failDurations.length
            : 0;

        // Booster Usage: % of users who used boosters
        const usersWithBoosters = new Set(
            [...completeEvents, ...failEvents]
                .filter(e => {
                    const props = e.properties as any;
                    return props?.boosters && (
                        typeof props.boosters === 'number' ? props.boosters > 0 :
                        typeof props.boosters === 'object' ? Object.keys(props.boosters).length > 0 :
                        false
                    );
                })
                .map(e => e.userId)
        );
        const boosterUsage = uniquePlayers > 0
            ? (usersWithBoosters.size / uniquePlayers) * 100
            : 0;

        // EGP (End Game Purchase) Rate: % of users who made revive purchase
        // Check both level_complete (if user failed then revived and completed) and level_failed events
        // EGP is now an integer representing the number of purchases
        const usersWithEGP = new Set(
            [...completeEvents, ...failEvents]
                .filter(e => {
                    const props = e.properties as any;
                    // Check if egp exists and is > 0 (integer) or true (backwards compatibility)
                    const egpValue = props?.egp ?? props?.endGamePurchase;
                    return (typeof egpValue === 'number' && egpValue > 0) || egpValue === true;
                })
                .map(e => e.userId)
        );
        // Calculate rate based on all players who reached completion/fail (not just failed)
        // This is because users can fail -> revive with EGP -> complete
        const egpRate = uniquePlayers > 0
            ? (usersWithEGP.size / uniquePlayers) * 100
            : 0;

        // Custom Metrics - aggregate from event properties
        const customMetrics = this.extractCustomMetrics([...completeEvents, ...failEvents]);

        // Get level name from first event
        const levelName = (events[0]?.properties as any)?.levelName;

        return {
            levelId,
            levelName,
            startedPlayers,
            completedPlayers,
            starts: totalStarts,
            completes: totalCompletes,
            fails: totalFails,
            winRate: Math.round(winRate * 100) / 100, // Round to 2 decimals
            completionRate: Math.round(completionRate * 100) / 100, // Round to 2 decimals
            failRate: Math.round(failRate * 100) / 100,
            funnelRate: Math.round(funnelRate * 100) / 100, // Round to 2 decimals
            churnTotal: Math.round(churnTotal * 100) / 100,
            churnStartComplete: Math.round(churnStartComplete * 100) / 100,
            churnCompleteNext: Math.round(churnCompleteNext * 100) / 100,
            apsRaw: Math.round(apsRaw * 100) / 100,
            apsClean: Math.round(apsClean * 100) / 100,
            meanCompletionDuration: Math.round(meanCompletionDuration * 100) / 100,
            meanFailDuration: Math.round(meanFailDuration * 100) / 100,
            cumulativeAvgTime: 0, // Will be calculated after all levels are processed
            boosterUsage: Math.round(boosterUsage * 100) / 100,
            egpRate: Math.round(egpRate * 100) / 100,
            customMetrics
        };
    }

    /**
     * Match start events with their corresponding conclusion events (complete or fail)
     * Returns only starts that have a matching conclusion
     */
    private matchStartsWithConclusions(startEvents: any[], conclusionEvents: any[]): any[] {
        const matchedStarts: any[] = [];
        
        // Group starts by user
        const userStarts = new Map<string, any[]>();
        for (const startEvent of startEvents) {
            if (!userStarts.has(startEvent.userId)) {
                userStarts.set(startEvent.userId, []);
            }
            userStarts.get(startEvent.userId)!.push(startEvent);
        }
        
        // For each conclusion, find the closest preceding start
        for (const conclusion of conclusionEvents) {
            const starts = userStarts.get(conclusion.userId);
            if (starts && starts.length > 0) {
                // Find the most recent start before this conclusion
                const validStarts = starts.filter(s => s.timestamp <= conclusion.timestamp);
                if (validStarts.length > 0) {
                    const closestStart = validStarts[validStarts.length - 1];
                    matchedStarts.push(closestStart);
                }
            }
        }
        
        return matchedStarts;
    }

    /**
     * Calculate durations between start and end events for the same user
     * Uses IQR (Interquartile Range) method to filter outliers
     */
    private calculateDurations(startEvents: any[], endEvents: any[]): number[] {
        const rawDurations: number[] = [];
        
        // Create a map of user's start events
        const userStarts = new Map<string, any[]>();
        for (const event of startEvents) {
            if (!userStarts.has(event.userId)) {
                userStarts.set(event.userId, []);
            }
            userStarts.get(event.userId)!.push(event);
        }

        // For each end event, find the closest previous start event
        for (const endEvent of endEvents) {
            const starts = userStarts.get(endEvent.userId);
            if (starts) {
                // Find the most recent start before this end
                const validStarts = starts.filter(s => s.timestamp <= endEvent.timestamp);
                if (validStarts.length > 0) {
                    const closestStart = validStarts[validStarts.length - 1];
                    const duration = (endEvent.timestamp.getTime() - closestStart.timestamp.getTime()) / 1000;
                    if (duration > 0) {
                        rawDurations.push(duration);
                    }
                }
            }
        }

        // Filter outliers using IQR method
        return this.filterOutliers(rawDurations);
    }

    /**
     * Filter outliers using IQR (Interquartile Range) method
     * Removes values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR
     */
    private filterOutliers(values: number[]): number[] {
        if (values.length < 4) {
            return values; // Not enough data for IQR
        }

        // Sort values
        const sorted = [...values].sort((a, b) => a - b);
        
        // Calculate Q1 (25th percentile) and Q3 (75th percentile)
        const q1Index = Math.floor(sorted.length * 0.25);
        const q3Index = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Index];
        const q3 = sorted[q3Index];
        
        // Ensure q1 and q3 are defined
        if (q1 === undefined || q3 === undefined) {
            return values;
        }
        
        // Calculate IQR
        const iqr = q3 - q1;
        
        // Define bounds
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        // Filter outliers
        const filtered = values.filter(v => v >= lowerBound && v <= upperBound);
        
        // Log outlier removal for monitoring
        const outliersRemoved = values.length - filtered.length;
        if (outliersRemoved > 0) {
            logger.debug(`Filtered ${outliersRemoved} outliers (${((outliersRemoved / values.length) * 100).toFixed(1)}%) using IQR method. Bounds: [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);
        }
        
        return filtered;
    }

    /**
     * Extract custom metrics from event properties
     */
    private extractCustomMetrics(events: any[]): Record<string, any> {
        const customMetrics: Record<string, any> = {};
        const knownFields = new Set([
            'levelId', 'levelName', 'score', 'timeSeconds', 'stars',
            'reason', 'attempts', 'boosters', 'egp', 'endGamePurchase'
        ]);

        // Collect all custom fields
        const customFields = new Map<string, number[]>();
        
        for (const event of events) {
            const props = event.properties as any;
            if (props) {
                for (const [key, value] of Object.entries(props)) {
                    if (!knownFields.has(key) && typeof value === 'number') {
                        if (!customFields.has(key)) {
                            customFields.set(key, []);
                        }
                        customFields.get(key)!.push(value);
                    }
                }
            }
        }

        // Calculate averages for custom fields
        for (const [key, values] of customFields.entries()) {
            if (values.length > 0) {
                const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
                customMetrics[key] = Math.round(avg * 100) / 100;
            }
        }

        return customMetrics;
    }

    /**
     * Get level funnel data with AB test breakdown
     */
    async getLevelFunnelWithCohorts(filters: LevelFunnelFilters): Promise<any> {
        try {
            if (!filters.abTestId) {
                // No AB test specified, return regular funnel
                return { default: await this.getLevelFunnelData(filters) };
            }

            // Get AB test variants
            const abTest = await prisma.aBTest.findUnique({
                where: { id: filters.abTestId },
                include: {
                    variants: true
                }
            });

            if (!abTest) {
                throw new Error('AB test not found');
            }

            // Get funnel data for each variant
            const cohortData: Record<string, LevelMetrics[]> = {};

            for (const variant of abTest.variants) {
                // Get users in this variant
                const variantUsers = await prisma.user.findMany({
                    where: {
                        gameId: filters.gameId,
                        // TODO: Add variant assignment logic
                    },
                    select: { id: true }
                });

                // Filter events by variant users
                // This is a simplified version - you may need to adjust based on your variant assignment logic
                cohortData[variant.name] = await this.getLevelFunnelData(filters);
            }

            return cohortData;
        } catch (error) {
            logger.error('Error in getLevelFunnelWithCohorts:', error);
            throw error;
        }
    }

    /**
     * Get available custom metrics for a game
     */
    async getAvailableCustomMetrics(gameId: string): Promise<string[]> {
        try {
            // Get a sample of level events to discover custom properties
            const sampleEvents = await prisma.event.findMany({
                where: {
                    gameId,
                    eventName: {
                        in: ['level_complete', 'level_failed']
                    }
                },
                take: 100,
                select: {
                    properties: true
                }
            });

            const knownFields = new Set([
                'levelId', 'levelName', 'score', 'timeSeconds', 'stars',
                'reason', 'attempts', 'boosters', 'egp', 'endGamePurchase'
            ]);

            const customFieldsSet = new Set<string>();

            for (const event of sampleEvents) {
                const props = event.properties as any;
                if (props) {
                    for (const key of Object.keys(props)) {
                        if (!knownFields.has(key)) {
                            customFieldsSet.add(key);
                        }
                    }
                }
            }

            return Array.from(customFieldsSet);
        } catch (error) {
            logger.error('Error in getAvailableCustomMetrics:', error);
            return [];
        }
    }
}

export default new LevelFunnelService();

