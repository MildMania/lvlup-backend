import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AnalyticsFilterParams } from '../types/api';
import { cache, generateCacheKey } from '../utils/simpleCache';
import prisma from '../prisma';

export interface RetentionData {
    day: number;
    count: number;
    percentage: number;
}

export interface ActiveUserData {
    date: string;
    dau: number; // Daily Active Users
    wau: number; // Weekly Active Users
    mau: number; // Monthly Active Users
}

export interface PlaytimeData {
    date: string;
    avgSessionDuration: number; // in seconds
    totalPlaytime: number; // in seconds
    sessionsPerUser: number;
}

export class AnalyticsMetricsService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    // Calculate retention metrics with flexible retention days and filters
    async calculateRetention(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<RetentionData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'retention',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (10 minute TTL for retention since it's expensive)
            const cached = cache.get<RetentionData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for retention: ${cacheKey}`);
                return cached;
            }

            const startTime = Date.now(); // Performance tracking
            logger.debug(`Cache miss for retention: ${cacheKey}, calculating...`);

            // Build user filters
            const userFilters: any = {
                gameId: gameId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            };

            // Add optional filters
            if (filters?.country) {
                // Filter users by their events' countryCode
                userFilters.events = {
                    some: {
                        countryCode: Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country
                    }
                };
            }

            if (filters?.platform) {
                userFilters.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                userFilters.version = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            // Get new users in date range with filters
            const newUsers = await this.prisma.user.findMany({
                where: userFilters,
                select: {
                    id: true,
                    externalId: true,
                    createdAt: true,
                }
            });

            if (newUsers.length === 0) {
                return [];
            }

            // Use custom retention days if provided, or default to standard days
            const retentionDays = filters?.retentionDays && filters.retentionDays.length > 0
                ? filters.retentionDays.sort((a, b) => a - b)  // Sort ascending
                : [1, 3, 7, 14, 30];

            // MEMORY OPTIMIZATION (CRITICAL):
            // Process retention days with efficient batching to prevent PostgreSQL shared memory exhaustion.
            // Previously, with 5k+ users, we were building OR conditions with thousands of clauses,
            // causing "could not resize shared memory segment" errors.
            // Solution: Process users in batches of 500 to keep query complexity manageable.
            const retentionPromises = retentionDays.map(async (day) => {
                let retainedCount = 0;
                let eligibleUsersCount = 0;

                // Filter users whose Day N has passed
                const eligibleUsers = newUsers.filter(user => {
                    const registrationDate = new Date(user.createdAt);
                    const userDayN = new Date(registrationDate);
                    userDayN.setDate(userDayN.getDate() + day);
                    return userDayN <= endDate;
                });

                eligibleUsersCount = eligibleUsers.length;

                if (eligibleUsersCount === 0) {
                    return { day, count: 0, percentage: 0 };
                }

                // MEMORY EFFICIENT: Process users in batches of 500 to avoid PostgreSQL memory issues
                // This prevents building massive OR conditions that exhaust shared memory
                const BATCH_SIZE = 500;
                const retainedUserIds = new Set<string>();

                for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
                    const batchUsers = eligibleUsers.slice(i, i + BATCH_SIZE);
                    
                    // Build smaller batch query
                    const userRetentionConditions = batchUsers.map(user => {
                        const registrationDate = new Date(user.createdAt);
                        const userDayN = new Date(registrationDate);
                        userDayN.setDate(userDayN.getDate() + day);
                        userDayN.setHours(0, 0, 0, 0);

                        const userDayNEnd = new Date(userDayN);
                        userDayNEnd.setHours(23, 59, 59, 999);

                        return {
                            userId: user.id,
                            timestamp: {
                                gte: userDayN,
                                lte: userDayNEnd
                            }
                        };
                    });

                    // Query this batch of users
                    const batchRetainedUsers = await this.prisma.event.findMany({
                        where: {
                            gameId: gameId,
                            OR: userRetentionConditions
                        },
                        select: {
                            userId: true
                        },
                        distinct: ['userId']
                    });

                    // Add to our set of retained users
                    batchRetainedUsers.forEach(user => retainedUserIds.add(user.userId));
                }

                retainedCount = retainedUserIds.size;

                // Calculate percentage based on eligible users for this specific retention day
                const percentage = eligibleUsersCount > 0 ? (retainedCount / eligibleUsersCount) * 100 : 0;

                return {
                    day,
                    count: retainedCount,
                    percentage: Math.round(percentage * 100) / 100
                };
            });

            // Execute all retention day calculations in parallel
            const retentionData = await Promise.all(retentionPromises);
            const sortedData = retentionData.sort((a, b) => a.day - b.day);

            // Cache for 30 minutes (1800 seconds) - retention doesn't need real-time updates
            cache.set(cacheKey, sortedData, 1800);

            const duration = Date.now() - startTime;
            logger.info(`Calculated retention metrics for game ${gameId} in ${duration}ms (${newUsers.length} users, batch size: 500)`);
            return sortedData;
        } catch (error) {
            logger.error('Error calculating retention:', error);
            throw error;
        }
    }

    // Calculate daily, weekly, monthly active users with filters
    async calculateActiveUsers(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<ActiveUserData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'activeUsers',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (5 minute TTL)
            const cached = cache.get<ActiveUserData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for active users: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for active users: ${cacheKey}, calculating...`);

            // Get daily active users for each day in the range
            const dailyData: ActiveUserData[] = [];

            // Clone dates to avoid modifying the originals
            const currentDate = new Date(startDate);
            const endDateValue = new Date(endDate);

            while (currentDate <= endDateValue) {
                const dayStart = new Date(currentDate);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                // Weekly range (7 days before current day)
                const weekStart = new Date(currentDate);
                weekStart.setDate(weekStart.getDate() - 6); // 7 days including current
                weekStart.setHours(0, 0, 0, 0);

                // Monthly range (30 days before current day)
                const monthStart = new Date(currentDate);
                monthStart.setDate(monthStart.getDate() - 29); // 30 days including current
                monthStart.setHours(0, 0, 0, 0);

                // Build base filters for events
                const buildEventFilters = (timeStart: Date, timeEnd: Date) => {
                    const baseFilters: any = {
                        gameId: gameId,
                        timestamp: {
                            gte: timeStart,
                            lte: timeEnd
                        }
                    };

                    // Use countryCode from event directly
                    if (filters?.country) {
                        baseFilters.countryCode = Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country;
                    }

                    // Add session filters if platform or version is specified
                    if (filters?.platform || filters?.version) {
                        baseFilters.session = {};

                        if (filters.platform) {
                            baseFilters.session.platform = Array.isArray(filters.platform)
                                ? { in: filters.platform }
                                : filters.platform;
                        }

                        if (filters.version) {
                            baseFilters.session.version = Array.isArray(filters.version)
                                ? { in: filters.version }
                                : filters.version;
                        }
                    }

                    return baseFilters;
                };

                // Get unique users for each time frame
                const [dau, wau, mau] = await Promise.all([
                    // Daily active users
                    this.prisma.event.findMany({
                        where: buildEventFilters(dayStart, dayEnd),
                        distinct: [Prisma.EventScalarFieldEnum.userId],
                        select: { userId: true }
                    }).then((rows: Array<{ userId: string }>) => rows.length),

                    // Weekly active users
                    this.prisma.event.findMany({
                        where: buildEventFilters(weekStart, dayEnd),
                        distinct: [Prisma.EventScalarFieldEnum.userId],
                        select: { userId: true }
                    }).then((rows: Array<{ userId: string }>) => rows.length),

                    // Monthly active users
                    this.prisma.event.findMany({
                        where: buildEventFilters(monthStart, dayEnd),
                        distinct: [Prisma.EventScalarFieldEnum.userId],
                        select: { userId: true }
                    }).then((rows: Array<{ userId: string }>) => rows.length)
                ]);

                // Format date as ISO string (YYYY-MM-DD)
                const dateString = currentDate.toISOString().split('T')[0];

                dailyData.push({
                    date: dateString || '',
                    dau,
                    wau,
                    mau
                });

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Cache for 5 minutes (300 seconds)
            cache.set(cacheKey, dailyData, 300);

            logger.info(`Calculated active user metrics for game ${gameId}`);
            return dailyData;
        } catch (error) {
            logger.error('Error calculating active users:', error);
            throw error;
        }
    }

    // Calculate daily playtime metrics with filters
    async calculatePlaytimeMetrics(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<PlaytimeData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'playtime',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (5 minute TTL)
            const cached = cache.get<PlaytimeData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for playtime: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for playtime: ${cacheKey}, calculating...`);

            // Get daily playtime data for each day in the range
            const playtimeData: PlaytimeData[] = [];

            // Clone dates to avoid modifying the originals
            const currentDate = new Date(startDate);
            const endDateValue = new Date(endDate);

            while (currentDate <= endDateValue) {
                const dayStart = new Date(currentDate);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                // Build session filters
                const sessionFilters: any = {
                    gameId: gameId,
                    startTime: {
                        gte: dayStart,
                        lte: dayEnd
                    },
                    // Only include sessions that have ended and have duration
                    endTime: { not: null },
                    duration: { not: null, gt: 0 }
                };

                // Apply optional filters
                if (filters?.platform) {
                    sessionFilters.platform = Array.isArray(filters.platform)
                        ? { in: filters.platform }
                        : filters.platform;
                }

                if (filters?.version) {
                    sessionFilters.version = Array.isArray(filters.version)
                        ? { in: filters.version }
                        : filters.version;
                }

                if (filters?.country) {
                    // Filter sessions by events with matching countryCode
                    // We need to use a subquery approach or filter events after
                    // For now, we'll add this to the session filter via events
                    sessionFilters.events = {
                        some: {
                            countryCode: Array.isArray(filters.country)
                                ? { in: filters.country }
                                : filters.country
                        }
                    };
                }

                // Get session data for this day
                const sessions = await this.prisma.session.findMany({
                    where: sessionFilters,
                    select: {
                        userId: true,
                        duration: true
                    }
                });

                // Calculate metrics
                const uniqueUsers = new Set(sessions.map((s: any) => s.userId)).size;
                const totalSessions = sessions.length;
                const totalDuration = sessions.reduce((sum: number, session: any) => sum + (session.duration || 0), 0);
                const avgSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
                const sessionsPerUser = uniqueUsers > 0 ? totalSessions / uniqueUsers : 0;

                // Total playtime per user = avg sessions per user * avg session duration
                const totalPlaytimePerUser = sessionsPerUser * avgSessionDuration;

                // Format date as ISO string (YYYY-MM-DD)
                const dateString = currentDate.toISOString().split('T')[0];

                playtimeData.push({
                    date: dateString || '',
                    avgSessionDuration,
                    totalPlaytime: totalPlaytimePerUser,
                    sessionsPerUser
                });

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            logger.info(`Calculated playtime metrics for game ${gameId}`);
            // Cache for 5 minutes (300 seconds)
            cache.set(cacheKey, playtimeData, 300);
            return playtimeData;
        } catch (error) {
            logger.error('Error calculating playtime metrics:', error);
            throw error;
        }
    }
}
