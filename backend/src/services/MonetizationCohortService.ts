import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';

export interface MonetizationCohortData {
    cohortDate: string;
    cohortSize: number;
    metrics: {
        [dayOffset: string]: {
            returningUsers: number;
            iapRevenue: number;
            adRevenue: number;
            totalRevenue: number;
            iapPayingUsers: number;
            arpuIap: number;
            arppuIap: number;
            arpu: number;
            conversionRate: number;
        };
    };
}

export class MonetizationCohortService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    /**
     * Get monetization cohort analysis
     * Analyzes revenue metrics (IAP, Ad) for user cohorts over time
     */
    async getMonetizationCohorts(
        gameId: string,
        startDate: Date,
        endDate: Date,
        cohortPeriod: 'day' | 'week' | 'month' = 'week',
        maxDays: number = 30,
        filters?: {
            country?: string | string[];
            platform?: string | string[];
            version?: string | string[];
        }
    ): Promise<MonetizationCohortData[]> {
        try {
            logger.info(`Fetching monetization cohorts for game ${gameId}`);

            // Build where clause with filters
            const whereClause: any = {
                gameId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            };

            // Apply filters
            if (filters?.country) {
                whereClause.country = Array.isArray(filters.country)
                    ? { in: filters.country }
                    : filters.country;
            }

            if (filters?.platform) {
                whereClause.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                whereClause.version = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            // Get all users grouped by cohort (first activity date)
            const users = await this.prisma.user.findMany({
                where: whereClause,
                select: {
                    id: true,
                    createdAt: true
                }
            });

            // Group users by cohort period
            const cohorts = this.groupUsersByCohort(users, cohortPeriod);
            const cohortDates = Object.keys(cohorts).sort();

            const cohortData: MonetizationCohortData[] = [];

            for (const cohortDate of cohortDates) {
                const userIds = cohorts[cohortDate];
                if (!userIds || userIds.length === 0) continue;
                
                // Parse cohort date properly with timezone consideration
                const cohortStartDate = new Date(cohortDate + 'T00:00:00.000Z');

                logger.info(`Processing cohort ${cohortDate} with ${userIds.length} users`);

                const metrics: MonetizationCohortData['metrics'] = {};

                // Calculate metrics for each day offset (Day 0, Day 1, Day 7, etc.)
                for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
                    // Calculate period boundaries correctly
                    const periodStart = new Date(cohortStartDate);
                    periodStart.setUTCDate(periodStart.getUTCDate() + dayOffset);
                    periodStart.setUTCHours(0, 0, 0, 0);
                    
                    const periodEnd = new Date(periodStart);
                    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
                    periodEnd.setUTCHours(0, 0, 0, 0);

                    logger.info(`Day ${dayOffset}: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

                    // Get returning users (users who had sessions on this day)
                    const returningUsers = await this.prisma.session.groupBy({
                        by: ['userId'],
                        where: {
                            gameId,
                            userId: { in: userIds },
                            startTime: {
                                gte: periodStart,
                                lt: periodEnd
                            }
                        }
                    });

                    const returningUserIds = returningUsers.map(u => u.userId);
                    const returningUserCount = returningUserIds.length;

                    if (returningUserCount === 0) {
                        metrics[`day${dayOffset}`] = {
                            returningUsers: 0,
                            iapRevenue: 0,
                            adRevenue: 0,
                            totalRevenue: 0,
                            iapPayingUsers: 0,
                            arpuIap: 0,
                            arppuIap: 0,
                            arpu: 0,
                            conversionRate: 0
                        };
                        continue;
                    }

                    // Get revenue data for this day
                    const revenueData = await this.prisma.revenue.groupBy({
                        by: ['userId', 'revenueType'],
                        where: {
                            gameId,
                            userId: { in: returningUserIds },
                            timestamp: {
                                gte: periodStart,
                                lt: periodEnd
                            }
                        },
                        _sum: {
                            revenue: true
                        }
                    });

                    // Calculate metrics
                    let iapRevenue = 0;
                    let adRevenue = 0;
                    const iapPayingUserIds = new Set<string>();

                    revenueData.forEach(item => {
                        const revenue = Number(item._sum.revenue || 0);
                        
                        if (item.revenueType === 'IN_APP_PURCHASE') {
                            iapRevenue += revenue;
                            iapPayingUserIds.add(item.userId);
                        } else if (item.revenueType === 'AD_IMPRESSION') {
                            adRevenue += revenue;
                        }
                    });

                    const totalRevenue = iapRevenue + adRevenue;
                    const iapPayingUsers = iapPayingUserIds.size;

                    // Calculate averages
                    const arpuIap = iapRevenue / returningUserCount; // IAP revenue per returning user
                    const arppuIap = iapPayingUsers > 0 ? iapRevenue / iapPayingUsers : 0; // IAP revenue per paying user
                    const arpu = totalRevenue / returningUserCount; // Total revenue per returning user (Ad + IAP)
                    const conversionRate = (iapPayingUsers / returningUserCount) * 100; // % of users who made IAP

                    metrics[`day${dayOffset}`] = {
                        returningUsers: returningUserCount,
                        iapRevenue: Math.round(iapRevenue * 100) / 100,
                        adRevenue: Math.round(adRevenue * 100) / 100,
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        iapPayingUsers,
                        arpuIap: Math.round(arpuIap * 100) / 100,
                        arppuIap: Math.round(arppuIap * 100) / 100,
                        arpu: Math.round(arpu * 100) / 100,
                        conversionRate: Math.round(conversionRate * 100) / 100
                    };
                }

                cohortData.push({
                    cohortDate,
                    cohortSize: userIds?.length || 0,
                    metrics
                });
            }

            logger.info(`Generated ${cohortData.length} monetization cohorts`);
            return cohortData;

        } catch (error) {
            logger.error('Error generating monetization cohorts:', error);
            throw error;
        }
    }

    /**
     * Group users by cohort period (day, week, or month)
     */
    private groupUsersByCohort(
        users: { id: string; createdAt: Date }[],
        period: 'day' | 'week' | 'month'
    ): Record<string, string[]> {
        const cohorts: Record<string, string[]> = {};

        users.forEach(user => {
            const cohortDate = this.getCohortDate(user.createdAt, period);
            if (!cohorts[cohortDate]) {
                cohorts[cohortDate] = [];
            }
            cohorts[cohortDate].push(user.id);
        });

        return cohorts;
    }

    /**
     * Get cohort date string based on period
     */
    private getCohortDate(date: Date, period: 'day' | 'week' | 'month'): string {
        const d = new Date(date);
        // Use UTC to avoid timezone issues
        d.setUTCHours(0, 0, 0, 0);

        if (period === 'day') {
            return d.toISOString().split('T')[0] || '';
        } else if (period === 'week') {
            // Get Monday of the week (in UTC)
            const day = d.getUTCDay();
            const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
            d.setUTCDate(diff);
            return d.toISOString().split('T')[0] || '';
        } else {
            // First day of month
            d.setUTCDate(1);
            return d.toISOString().split('T')[0] || '';
        }
    }
}

