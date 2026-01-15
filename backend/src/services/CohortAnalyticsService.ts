import { PrismaClient } from '@prisma/client';

// Cohort data for a specific install date
export interface CohortData {
    installDate: string;
    installCount: number;
    retentionByDay: { [day: number]: number }; // day -> retention percentage
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
                userFilters.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                userFilters.version = Array.isArray(filters.version)
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

                // Calculate retention for each specified day
                for (const day of retentionDays) {
                    // Day 0 is always 100% (install day)
                    if (day === 0) {
                        retentionByDay[day] = 100;
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
                }

                cohortData.push({
                    installDate,
                    installCount: userIds.length,
                    retentionByDay
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
}
