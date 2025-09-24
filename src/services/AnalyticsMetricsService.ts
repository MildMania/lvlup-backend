import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AnalyticsFilterParams } from '../types/api';

const prisma = new PrismaClient();

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
    // Calculate retention metrics with flexible retention days and filters
    async calculateRetention(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<RetentionData[]> {
        try {
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
                userFilters.country = Array.isArray(filters.country)
                    ? { in: filters.country }
                    : filters.country;
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
            const newUsers = await prisma.user.findMany({
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

            const retentionData: RetentionData[] = [];

            for (const day of retentionDays) {
                let retainedCount = 0;

                // For each user, check if they have any event after their registration + N days
                for (const user of newUsers) {
                    const retentionDate = new Date(user.createdAt);
                    retentionDate.setDate(retentionDate.getDate() + day);

                    // Skip users whose retention date is beyond our end date
                    if (retentionDate > endDate) {
                        continue;
                    }

                    // Build event filters for retention check
                    const eventFilters: any = {
                        userId: user.id,
                        gameId: gameId,
                        timestamp: {
                            gte: retentionDate
                        }
                    };

                    // Add optional event filters if available
                    if (filters?.platform || filters?.version) {
                        // We need to fetch the events with session information
                        // to filter by platform and version
                        eventFilters.session = {};

                        if (filters?.platform) {
                            eventFilters.session.platform = Array.isArray(filters.platform)
                                ? { in: filters.platform }
                                : filters.platform;
                        }

                        if (filters?.version) {
                            eventFilters.session.version = Array.isArray(filters.version)
                                ? { in: filters.version }
                                : filters.version;
                        }
                    }

                    // Count if user has any event on or after the retention date
                    const hasReturnedAfterDay = await prisma.event.findFirst({
                        where: eventFilters
                    });

                    if (hasReturnedAfterDay) {
                        retainedCount++;
                    }
                }

                // Calculate percentage - eligible users are those whose retention date is within our data range
                const eligibleUsers = newUsers.filter((user: any) => {
                    const retentionDate = new Date(user.createdAt);
                    retentionDate.setDate(retentionDate.getDate() + day);
                    return retentionDate <= endDate;
                }).length;

                const percentage = eligibleUsers > 0 ? (retainedCount / eligibleUsers) * 100 : 0;

                retentionData.push({
                    day,
                    count: retainedCount,
                    percentage: Math.round(percentage * 100) / 100 // Round to 2 decimal places
                });
            }

            logger.info(`Calculated retention metrics for game ${gameId}`);
            return retentionData;
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

                    // Join with user to apply country filter if needed
                    if (filters?.country) {
                        baseFilters.user = {
                            country: Array.isArray(filters.country)
                                ? { in: filters.country }
                                : filters.country
                        };
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
                    prisma.event.groupBy({
                        by: ['userId'],
                        where: buildEventFilters(dayStart, dayEnd)
                    }).then((results: any[]) => results.length),

                    // Weekly active users
                    prisma.event.groupBy({
                        by: ['userId'],
                        where: buildEventFilters(weekStart, dayEnd)
                    }).then((results: any[]) => results.length),

                    // Monthly active users
                    prisma.event.groupBy({
                        by: ['userId'],
                        where: buildEventFilters(monthStart, dayEnd)
                    }).then((results: any[]) => results.length)
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
                    duration: { not: null }
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
                    sessionFilters.user = {
                        country: Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country
                    };
                }

                // Get session data for this day
                const sessions = await prisma.session.findMany({
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

                // Format date as ISO string (YYYY-MM-DD)
                const dateString = currentDate.toISOString().split('T')[0];

                playtimeData.push({
                    date: dateString || '',
                    avgSessionDuration,
                    totalPlaytime: totalDuration,
                    sessionsPerUser
                });

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            logger.info(`Calculated playtime metrics for game ${gameId}`);
            return playtimeData;
        } catch (error) {
            logger.error('Error calculating playtime metrics:', error);
            throw error;
        }
    }
}