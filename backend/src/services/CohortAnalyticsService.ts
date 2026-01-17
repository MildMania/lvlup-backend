import { PrismaClient } from '@prisma/client';

// Cohort data for a specific install date
export interface CohortData {
    installDate: string;
    installCount: number;
    retentionByDay: { [day: number]: number }; // day -> retention percentage
    userCountByDay: { [day: number]: number }; // day -> absolute user count
}

// Cohort analytics parameters
export interface CohortAnalyticsParams {
    country?: string | string[];
    platform?: string | string[];
    version?: string | string[];
    abTestGroup?: string;
    days?: number[]; // Array of days to calculate retention for (e.g., [0, 1, 3, 7, 14, 30])
}

/**
 * Service for cohort-based analytics
 */
export class CohortAnalyticsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    /**
     * Calculate cohort retention table
     * @param gameId The game ID
     * @param startDate Start date for cohorts (first install date)
     * @param endDate End date for cohorts (last install date)
     * @param filters Optional filters (platform, country, version, etc.)
     */
    async calculateCohortRetention(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            // Default retention days if not specified
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];

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
                // Filter users by their events' platform
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                // Filter users by their events' appVersion
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.appVersion = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            // Get all users in date range with filters
            const users = await this.prisma.user.findMany({
                where: userFilters,
                select: {
                    id: true,
                    createdAt: true
                }
            });

            if (users.length === 0) {
                return [];
            }

            // Group users by install date (YYYY-MM-DD) in UTC
            const cohortMap = new Map<string, string[]>();

            for (const user of users) {
                // user.createdAt is a BigInt timestamp in milliseconds
                const timestamp = typeof user.createdAt === 'bigint'
                    ? Number(user.createdAt)
                    : user.createdAt;
                const installDate = new Date(timestamp);
                // Get the UTC date string (YYYY-MM-DD)
                const dateKey = installDate.toISOString().split('T')[0];

                if (dateKey) {
                    if (!cohortMap.has(dateKey)) {
                        cohortMap.set(dateKey, []);
                    }
                    cohortMap.get(dateKey)!.push(user.id);
                }
            }

            // Calculate retention for each cohort
            const cohortData: CohortData[] = [];

            for (const [installDate, userIds] of cohortMap.entries()) {
                const installDateObj = new Date(installDate + 'T00:00:00.000Z');
                const retentionByDay: { [day: number]: number } = {};
                const userCountByDay: { [day: number]: number } = {};

                // Calculate retention for each specified day
                for (const day of retentionDays) {
                    // Day 0 is always 100% (install day) - all users who installed count as Day 0
                    if (day === 0) {
                        retentionByDay[day] = 100;
                        userCountByDay[day] = userIds.length; // Same as installCount
                        continue;
                    }

                    // Calculate the target date for Day N
                    const targetDate = new Date(installDateObj);
                    targetDate.setDate(targetDate.getDate() + day);
                    const targetDateStart = new Date(targetDate);
                    targetDateStart.setHours(0, 0, 0, 0);
                    const targetDateEnd = new Date(targetDate);
                    targetDateEnd.setHours(23, 59, 59, 999);

                    // Check if target date is in the future
                    const now = new Date();
                    if (targetDateStart > now) {
                        retentionByDay[day] = -1; // Marker for "not yet available"
                        userCountByDay[day] = 0;
                        continue;
                    }

                    // Count how many users from this cohort had activity on Day N
                    const eventFilters: any = {
                        userId: { in: userIds },
                        gameId: gameId,
                        timestamp: {
                            gte: targetDateStart,
                            lte: targetDateEnd
                        }
                    };

                    // Add session filters if platform or version is specified
                    if (filters?.platform || filters?.version) {
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

                    const activeUsers = await this.prisma.event.groupBy({
                        by: ['userId'],
                        where: eventFilters
                    });

                    const retainedCount = activeUsers.length;
                    const retentionRate = (retainedCount / userIds.length) * 100;
                    retentionByDay[day] = Math.round(retentionRate * 100) / 100; // Round to 2 decimals
                    userCountByDay[day] = retainedCount;
                }

                cohortData.push({
                    installDate,
                    installCount: userIds.length,
                    retentionByDay,
                    userCountByDay
                });
            }

            // Sort by install date (oldest first)
            cohortData.sort((a, b) => a.installDate.localeCompare(b.installDate));

            return cohortData;
        } catch (error) {
            console.error('Error calculating cohort retention:', error);
            throw new Error('Failed to calculate cohort retention');
        }
    }

    /**
     * Close database connection
     */
    async disconnect() {
        await this.prisma.$disconnect();
    }

    /**
     * Calculate cohort playtime metrics (average daily playtime per cohort)
     */
    async calculateCohortPlaytime(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            
            const userFilters: any = {
                gameId: gameId,
                createdAt: { gte: startDate, lte: endDate }
            };

            if (filters?.country) {
                userFilters.events = {
                    some: {
                        countryCode: Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country
                    }
                };
            }

            if (filters?.platform) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.appVersion = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            const users = await this.prisma.user.findMany({
                where: userFilters,
                select: { id: true, createdAt: true }
            });

            if (users.length === 0) return [];

            const cohortMap = new Map<string, string[]>();
            for (const user of users) {
                const timestamp = typeof user.createdAt === 'bigint' ? Number(user.createdAt) : user.createdAt;
                const installDate = new Date(timestamp);
                const dateKey = installDate.toISOString().split('T')[0];
                if (dateKey) {
                    if (!cohortMap.has(dateKey)) cohortMap.set(dateKey, []);
                    cohortMap.get(dateKey)!.push(user.id);
                }
            }

            const cohortData: CohortData[] = [];

            for (const [installDate, userIds] of cohortMap.entries()) {
                const installDateObj = new Date(installDate + 'T00:00:00.000Z');
                const retentionByDay: { [day: number]: number } = {};
                const userCountByDay: { [day: number]: number } = {};

                for (const day of retentionDays) {
                    // Day 0 special handling - all installed users count
                    if (day === 0) {
                        userCountByDay[day] = userIds.length; // Same as installCount
                        
                        // Calculate Day 0 playtime
                        const targetDateStart = new Date(installDateObj);
                        targetDateStart.setHours(0, 0, 0, 0);
                        const targetDateEnd = new Date(installDateObj);
                        targetDateEnd.setHours(23, 59, 59, 999);

                        const sessionFilters: any = {
                            userId: { in: userIds },
                            gameId: gameId,
                            startTime: { gte: targetDateStart, lte: targetDateEnd },
                            endTime: { not: null },
                            duration: { not: null }
                        };

                        if (filters?.platform) {
                            sessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                        }
                        if (filters?.version) {
                            sessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                        }

                        const sessions = await this.prisma.session.findMany({
                            where: sessionFilters,
                            select: { userId: true, duration: true }
                        });

                        if (sessions.length > 0) {
                            const userPlaytime = new Map<string, number>();
                            for (const session of sessions) {
                                const current = userPlaytime.get(session.userId) || 0;
                                userPlaytime.set(session.userId, current + (session.duration || 0));
                            }
                            const totalPlaytime = Array.from(userPlaytime.values()).reduce((sum, val) => sum + val, 0);
                            const avgPlaytime = totalPlaytime / userPlaytime.size / 60;
                            retentionByDay[day] = Math.round(avgPlaytime * 10) / 10;
                        } else {
                            retentionByDay[day] = 0;
                        }
                        continue;
                    }

                    const targetDate = new Date(installDateObj);
                    targetDate.setDate(targetDate.getDate() + day);
                    const targetDateStart = new Date(targetDate);
                    targetDateStart.setHours(0, 0, 0, 0);
                    const targetDateEnd = new Date(targetDate);
                    targetDateEnd.setHours(23, 59, 59, 999);

                    if (targetDateStart > new Date()) {
                        retentionByDay[day] = -1;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const sessionFilters: any = {
                        userId: { in: userIds },
                        gameId: gameId,
                        startTime: { gte: targetDateStart, lte: targetDateEnd },
                        endTime: { not: null },
                        duration: { not: null }
                    };

                    if (filters?.platform) {
                        sessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                    }
                    if (filters?.version) {
                        sessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                    }

                    const sessions = await this.prisma.session.findMany({
                        where: sessionFilters,
                        select: { userId: true, duration: true }
                    });

                    if (sessions.length === 0) {
                        retentionByDay[day] = 0;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const userPlaytime = new Map<string, number>();
                    for (const session of sessions) {
                        const current = userPlaytime.get(session.userId) || 0;
                        userPlaytime.set(session.userId, current + (session.duration || 0));
                    }

                    const totalPlaytime = Array.from(userPlaytime.values()).reduce((sum, val) => sum + val, 0);
                    const avgPlaytime = totalPlaytime / userPlaytime.size / 60; // Convert to minutes
                    retentionByDay[day] = Math.round(avgPlaytime * 10) / 10;
                    userCountByDay[day] = userPlaytime.size; // Number of unique users with sessions
                }

                cohortData.push({ installDate, installCount: userIds.length, retentionByDay, userCountByDay });
            }

            cohortData.sort((a, b) => a.installDate.localeCompare(b.installDate));
            return cohortData;
        } catch (error) {
            console.error('Error calculating cohort playtime:', error);
            throw new Error('Failed to calculate cohort playtime');
        }
    }

    /**
     * Calculate cohort session count metrics (average sessions per user per day)
     */
    async calculateCohortSessionCount(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            
            const userFilters: any = {
                gameId: gameId,
                createdAt: { gte: startDate, lte: endDate }
            };

            if (filters?.country) {
                userFilters.events = {
                    some: {
                        countryCode: Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country
                    }
                };
            }

            if (filters?.platform) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.appVersion = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            const users = await this.prisma.user.findMany({
                where: userFilters,
                select: { id: true, createdAt: true }
            });

            if (users.length === 0) return [];

            const cohortMap = new Map<string, string[]>();
            for (const user of users) {
                const timestamp = typeof user.createdAt === 'bigint' ? Number(user.createdAt) : user.createdAt;
                const installDate = new Date(timestamp);
                const dateKey = installDate.toISOString().split('T')[0];
                if (dateKey) {
                    if (!cohortMap.has(dateKey)) cohortMap.set(dateKey, []);
                    cohortMap.get(dateKey)!.push(user.id);
                }
            }

            const cohortData: CohortData[] = [];

            for (const [installDate, userIds] of cohortMap.entries()) {
                const installDateObj = new Date(installDate + 'T00:00:00.000Z');
                const retentionByDay: { [day: number]: number } = {};
                const userCountByDay: { [day: number]: number } = {};

                for (const day of retentionDays) {
                    // Day 0 special handling - all installed users count
                    if (day === 0) {
                        userCountByDay[day] = userIds.length; // Same as installCount
                        
                        // Calculate Day 0 session count
                        const day0Start = new Date(installDateObj);
                        day0Start.setHours(0, 0, 0, 0);
                        const day0End = new Date(installDateObj);
                        day0End.setHours(23, 59, 59, 999);

                        const day0SessionFilters: any = {
                            userId: { in: userIds },
                            gameId: gameId,
                            startTime: { gte: day0Start, lte: day0End }
                        };

                        if (filters?.platform) {
                            day0SessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                        }
                        if (filters?.version) {
                            day0SessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                        }

                        const userSessions = await this.prisma.session.groupBy({
                            by: ['userId'],
                            _count: { id: true },
                            where: day0SessionFilters
                        });

                        if (userSessions.length > 0) {
                            const totalSessions = userSessions.reduce((sum: number, u: any) => sum + u._count.id, 0);
                            const avgSessions = totalSessions / userSessions.length;
                            retentionByDay[day] = Math.round(avgSessions * 100) / 100;
                        } else {
                            retentionByDay[day] = 0;
                        }
                        continue;
                    }

                    const targetDate = new Date(installDateObj);
                    targetDate.setDate(targetDate.getDate() + day);
                    const targetDateStart = new Date(targetDate);
                    targetDateStart.setHours(0, 0, 0, 0);
                    const targetDateEnd = new Date(targetDate);
                    targetDateEnd.setHours(23, 59, 59, 999);

                    if (targetDateStart > new Date()) {
                        retentionByDay[day] = -1;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const sessionFilters: any = {
                        userId: { in: userIds },
                        gameId: gameId,
                        startTime: { gte: targetDateStart, lte: targetDateEnd }
                    };

                    if (filters?.platform) {
                        sessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                    }
                    if (filters?.version) {
                        sessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                    }

                    const userSessions = await this.prisma.session.groupBy({
                        by: ['userId'],
                        _count: { id: true },
                        where: sessionFilters
                    });

                    if (userSessions.length === 0) {
                        retentionByDay[day] = 0;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const totalSessions = userSessions.reduce((sum: number, u: any) => sum + u._count.id, 0);
                    const avgSessions = totalSessions / userSessions.length;
                    retentionByDay[day] = Math.round(avgSessions * 100) / 100;
                    userCountByDay[day] = userSessions.length; // Number of unique users with sessions
                }

                cohortData.push({ installDate, installCount: userIds.length, retentionByDay, userCountByDay });
            }

            cohortData.sort((a, b) => a.installDate.localeCompare(b.installDate));
            return cohortData;
        } catch (error) {
            console.error('Error calculating cohort session count:', error);
            throw new Error('Failed to calculate cohort session count');
        }
    }

    /**
     * Calculate cohort session length metrics (average session duration per day)
     */
    async calculateCohortSessionLength(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            
            const userFilters: any = {
                gameId: gameId,
                createdAt: { gte: startDate, lte: endDate }
            };

            if (filters?.country) {
                userFilters.events = {
                    some: {
                        countryCode: Array.isArray(filters.country)
                            ? { in: filters.country }
                            : filters.country
                    }
                };
            }

            if (filters?.platform) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                if (!userFilters.events) {
                    userFilters.events = { some: {} };
                } else if (!userFilters.events.some) {
                    userFilters.events.some = {};
                }
                userFilters.events.some.appVersion = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            const users = await this.prisma.user.findMany({
                where: userFilters,
                select: { id: true, createdAt: true }
            });

            if (users.length === 0) return [];

            const cohortMap = new Map<string, string[]>();
            for (const user of users) {
                const timestamp = typeof user.createdAt === 'bigint' ? Number(user.createdAt) : user.createdAt;
                const installDate = new Date(timestamp);
                const dateKey = installDate.toISOString().split('T')[0];
                if (dateKey) {
                    if (!cohortMap.has(dateKey)) cohortMap.set(dateKey, []);
                    cohortMap.get(dateKey)!.push(user.id);
                }
            }

            const cohortData: CohortData[] = [];

            for (const [installDate, userIds] of cohortMap.entries()) {
                const installDateObj = new Date(installDate + 'T00:00:00.000Z');
                const retentionByDay: { [day: number]: number } = {};
                const userCountByDay: { [day: number]: number } = {};

                for (const day of retentionDays) {
                    // Day 0 special handling - all installed users count
                    if (day === 0) {
                        userCountByDay[day] = userIds.length; // Same as installCount
                        
                        // Calculate Day 0 session length
                        const day0Start = new Date(installDateObj);
                        day0Start.setHours(0, 0, 0, 0);
                        const day0End = new Date(installDateObj);
                        day0End.setHours(23, 59, 59, 999);

                        const day0SessionFilters: any = {
                            userId: { in: userIds },
                            gameId: gameId,
                            startTime: { gte: day0Start, lte: day0End },
                            endTime: { not: null },
                            duration: { not: null }
                        };

                        if (filters?.platform) {
                            day0SessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                        }
                        if (filters?.version) {
                            day0SessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                        }

                        const sessions = await this.prisma.session.findMany({
                            where: day0SessionFilters,
                            select: { duration: true, userId: true }
                        });

                        if (sessions.length > 0) {
                            const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
                            const avgDuration = totalDuration / sessions.length / 60;
                            retentionByDay[day] = Math.round(avgDuration * 10) / 10;
                        } else {
                            retentionByDay[day] = 0;
                        }
                        continue;
                    }

                    const targetDate = new Date(installDateObj);
                    targetDate.setDate(targetDate.getDate() + day);
                    const targetDateStart = new Date(targetDate);
                    targetDateStart.setHours(0, 0, 0, 0);
                    const targetDateEnd = new Date(targetDate);
                    targetDateEnd.setHours(23, 59, 59, 999);

                    if (targetDateStart > new Date()) {
                        retentionByDay[day] = -1;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const sessionFilters: any = {
                        userId: { in: userIds },
                        gameId: gameId,
                        startTime: { gte: targetDateStart, lte: targetDateEnd },
                        endTime: { not: null },
                        duration: { not: null }
                    };

                    if (filters?.platform) {
                        sessionFilters.platform = Array.isArray(filters.platform) ? { in: filters.platform } : filters.platform;
                    }
                    if (filters?.version) {
                        sessionFilters.version = Array.isArray(filters.version) ? { in: filters.version } : filters.version;
                    }

                    const sessions = await this.prisma.session.findMany({
                        where: sessionFilters,
                        select: { duration: true, userId: true }
                    });

                    if (sessions.length === 0) {
                        retentionByDay[day] = 0;
                        userCountByDay[day] = 0;
                        continue;
                    }

                    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
                    const avgDuration = totalDuration / sessions.length / 60; // Convert to minutes
                    retentionByDay[day] = Math.round(avgDuration * 10) / 10;
                    
                    // Count unique users with sessions
                    const uniqueUsers = new Set(sessions.map(s => s.userId));
                    userCountByDay[day] = uniqueUsers.size;
                }

                cohortData.push({ installDate, installCount: userIds.length, retentionByDay, userCountByDay });
            }

            cohortData.sort((a, b) => a.installDate.localeCompare(b.installDate));
            return cohortData;
        } catch (error) {
            console.error('Error calculating cohort session length:', error);
            throw new Error('Failed to calculate cohort session length');
        }
    }
}
