import { PrismaClient } from '@prisma/client';
import { AnalyticsFilterParams } from '../types/api';
import logger from '../utils/logger';

// Create PrismaClient with type assertion
const prisma = new PrismaClient() as any;

// Types for Session Count Analytics
export interface SessionCountData {
    date: string;
    sessionCounts: {
        average: number;
        median: number;
        distribution: Record<string, number>;
    };
}

// Types for Session Length Analytics
export interface SessionLengthData {
    date: string;
    sessionLength: {
        average: number;
        median: number;
        total: number;
        distribution: Record<string, number>;
    };
}

// Types for Engagement Metrics (combining session count and length)
export interface EngagementMetricsParams extends AnalyticsFilterParams {
    days?: number[];
    groupBy?: 'day' | 'week' | 'month';
    durationType?: 'average' | 'total' | 'distribution' | 'all';
}

/**
 * Service for engagement metrics analytics
 */
export class EngagementMetricsService {
    private prisma: any;

    constructor(prismaClient?: any) {
        this.prisma = prismaClient || prisma;
    }
    /**
     * Calculate session count metrics per user per day
     * @param gameId The game ID
     * @param startDate Start date for analysis
     * @param endDate End date for analysis
     * @param filters Optional filters
     */
    async calculateSessionCounts(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: EngagementMetricsParams
    ): Promise<SessionCountData[]> {
        try {
            // Clone dates to avoid modifying the originals
            const currentDate = new Date(startDate);
            const endDateValue = new Date(endDate);
            const sessionCountData: SessionCountData[] = [];

            // Build base query filters
            const baseFilters: any = {
                gameId: gameId,
            };

            // Apply country filter directly on session
            if (filters?.country) {
                baseFilters.countryCode = Array.isArray(filters.country)
                    ? { in: filters.country }
                    : filters.country;
            }

            // Process each day in the date range
            while (currentDate <= endDateValue) {
                const dayStart = new Date(currentDate);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                // Format date as ISO string (YYYY-MM-DD)
                const dateString = currentDate.toISOString().split('T')[0] || '';

                // Create session filters for this day
                const sessionFilters = {
                    ...baseFilters,
                    startTime: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                };

                // Apply platform filter if specified
                if (filters?.platform) {
                    sessionFilters.platform = Array.isArray(filters.platform)
                        ? { in: filters.platform }
                        : filters.platform;
                }

                // Apply version filter if specified
                if (filters?.version) {
                    sessionFilters.version = Array.isArray(filters.version)
                        ? { in: filters.version }
                        : filters.version;
                }


                // Get the sessions for this day, grouped by user
                const userSessions = await this.prisma.session.groupBy({
                    by: ['userId'],
                    _count: {
                        id: true  // Count sessions per user
                    },
                    where: sessionFilters
                });

                // Calculate metrics if we have data
                if (userSessions.length > 0) {
                    // Extract session counts per user
                    const sessionCounts = userSessions.map((s: any) => s._count.id);

                    // Calculate average
                    const totalSessions = sessionCounts.reduce((sum: number, count: number) => sum + count, 0);
                    const averageSessions = totalSessions / userSessions.length;

                    // Calculate median
                    const sortedCounts = [...sessionCounts].sort((a, b) => a - b);
                    const midIndex = Math.floor(sortedCounts.length / 2);
                    const medianSessions = sortedCounts.length % 2 === 0
                        ? (sortedCounts[midIndex - 1] + sortedCounts[midIndex]) / 2
                        : sortedCounts[midIndex];

                    // Calculate distribution
                    const distribution: Record<string, number> = {
                        '1': 0,
                        '2-5': 0,
                        '6-10': 0,
                        '10+': 0
                    };

                    for (const count of sessionCounts) {
                        if (count === 1) {
                            distribution['1'] = (distribution['1'] || 0) + 1;
                        } else if (count >= 2 && count <= 5) {
                            distribution['2-5'] = (distribution['2-5'] || 0) + 1;
                        } else if (count >= 6 && count <= 10) {
                            distribution['6-10'] = (distribution['6-10'] || 0) + 1;
                        } else {
                            distribution['10+'] = (distribution['10+'] || 0) + 1;
                        }
                    }

                    // Add the data for this day
                    sessionCountData.push({
                        date: dateString,
                        sessionCounts: {
                            average: parseFloat(averageSessions.toFixed(2)),
                            median: medianSessions,
                            distribution
                        }
                    });
                } else {
                    // Add empty data for this day
                    sessionCountData.push({
                        date: dateString,
                        sessionCounts: {
                            average: 0,
                            median: 0,
                            distribution: {
                                '1': 0,
                                '2-5': 0,
                                '6-10': 0,
                                '10+': 0
                            }
                        }
                    });
                }

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // If specific days are requested, filter the results
            if (filters?.days && filters.days.length > 0) {
                // Convert startDate to day number (1-indexed)
                const startDay = startDate.getDate();

                // Filter results to include only the specified days
                return sessionCountData.filter((item, index) => {
                    const dayNumber = startDay + index;
                    return filters.days!.includes(dayNumber);
                });
            }

            logger.info(`Calculated session count metrics for game ${gameId}`);
            return sessionCountData;
        } catch (error) {
            logger.error('Error calculating session counts:', error);
            throw error;
        }
    }

    /**
     * Calculate session length metrics per user per day
     * @param gameId The game ID
     * @param startDate Start date for analysis
     * @param endDate End date for analysis
     * @param filters Optional filters
     */
    async calculateSessionLengths(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: EngagementMetricsParams
    ): Promise<SessionLengthData[]> {
        try {
            // Clone dates to avoid modifying the originals
            const currentDate = new Date(startDate);
            const endDateValue = new Date(endDate);
            const sessionLengthData: SessionLengthData[] = [];

            // Build base query filters
            const baseFilters: any = {
                gameId: gameId,
                // Only include sessions that have ended and have duration
                endTime: { not: null },
                duration: { not: null }
            };

            // Apply country filter directly on session
            if (filters?.country) {
                baseFilters.countryCode = Array.isArray(filters.country)
                    ? { in: filters.country }
                    : filters.country;
            }

            // Process each day in the date range
            while (currentDate <= endDateValue) {
                const dayStart = new Date(currentDate);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                // Format date as ISO string (YYYY-MM-DD)
                const dateString = currentDate.toISOString().split('T')[0] || '';

                // Create session filters for this day
                const sessionFilters = {
                    ...baseFilters,
                    startTime: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                };

                // Apply platform filter if specified
                if (filters?.platform) {
                    sessionFilters.platform = Array.isArray(filters.platform)
                        ? { in: filters.platform }
                        : filters.platform;
                }

                // Apply version filter if specified
                if (filters?.version) {
                    sessionFilters.version = Array.isArray(filters.version)
                        ? { in: filters.version }
                        : filters.version;
                }


                // Get all sessions with durations for this day
                const sessions = await this.prisma.session.findMany({
                    where: sessionFilters,
                    select: {
                        userId: true,
                        duration: true
                    }
                });

                // Calculate metrics if we have data
                if (sessions.length > 0) {
                    // Group sessions by user
                    const userSessionMap: Record<string, number[]> = {};

                    for (const session of sessions) {
                        const userId = session.userId;
                        const duration = session.duration || 0;

                        if (!userSessionMap[userId]) {
                            userSessionMap[userId] = [];
                        }
                        userSessionMap[userId].push(duration);
                    }

                    // Get unique users
                    const uniqueUsers = Object.keys(userSessionMap);

                    // Calculate metrics across all sessions
                    const allDurations = sessions.map((s: any) => s.duration || 0);
                    const totalDuration = allDurations.reduce((sum: number, duration: number) => sum + duration, 0);
                    const avgDuration = totalDuration / sessions.length;

                    // Calculate median duration
                    const sortedDurations = [...allDurations].sort((a, b) => a - b);
                    let medianDuration = 0;

                    if (sortedDurations.length > 0) {
                        const midIndex = Math.floor(sortedDurations.length / 2);
                        if (sortedDurations.length % 2 === 0 && midIndex > 0) {
                            // Even number of durations
                            const midValue1 = sortedDurations[midIndex - 1] || 0;
                            const midValue2 = sortedDurations[midIndex] || 0;
                            medianDuration = (midValue1 + midValue2) / 2;
                        } else {
                            // Odd number of durations
                            medianDuration = sortedDurations[midIndex] || 0;
                        }
                    }

                    // Calculate distribution
                    const distribution: Record<string, number> = {
                        '<1min': 0,
                        '1-5min': 0,
                        '5-15min': 0,
                        '15-30min': 0,
                        '30min+': 0
                    };

                    for (const duration of allDurations) {
                        if (duration < 60) {
                            distribution['<1min'] = (distribution['<1min'] || 0) + 1;
                        } else if (duration >= 60 && duration < 300) {
                            distribution['1-5min'] = (distribution['1-5min'] || 0) + 1;
                        } else if (duration >= 300 && duration < 900) {
                            distribution['5-15min'] = (distribution['5-15min'] || 0) + 1;
                        } else if (duration >= 900 && duration < 1800) {
                            distribution['15-30min'] = (distribution['15-30min'] || 0) + 1;
                        } else {
                            distribution['30min+'] = (distribution['30min+'] || 0) + 1;
                        }
                    }

                    // Add the data for this day
                    sessionLengthData.push({
                        date: dateString,
                        sessionLength: {
                            average: parseFloat(avgDuration.toFixed(2)),
                            median: medianDuration,
                            total: totalDuration,
                            distribution
                        }
                    });
                } else {
                    // Add empty data for this day
                    sessionLengthData.push({
                        date: dateString,
                        sessionLength: {
                            average: 0,
                            median: 0,
                            total: 0,
                            distribution: {
                                '<1min': 0,
                                '1-5min': 0,
                                '5-15min': 0,
                                '15-30min': 0,
                                '30min+': 0
                            }
                        }
                    });
                }

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // If specific days are requested, filter the results
            if (filters?.days && filters.days.length > 0) {
                // Convert startDate to day number (1-indexed)
                const startDay = startDate.getDate();

                // Filter results to include only the specified days
                return sessionLengthData.filter((item, index) => {
                    const dayNumber = startDay + index;
                    return filters.days!.includes(dayNumber);
                });
            }

            logger.info(`Calculated session length metrics for game ${gameId}`);
            return sessionLengthData;
        } catch (error) {
            logger.error('Error calculating session lengths:', error);
            throw error;
        }
    }
}