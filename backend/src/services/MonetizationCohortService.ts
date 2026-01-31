import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';
import { CohortAnalyticsService } from './CohortAnalyticsService';

// Monetization cohort data structure
export interface MonetizationCohortData {
    cohortDate: string;
    cohortSize: number;
    metrics: {
        [key: string]: {
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

/**
 * Service for monetization cohort analysis
 * Leverages the optimized CohortAnalyticsService for cohort structure
 */
export class MonetizationCohortService {
    private prisma: PrismaClient;
    private cohortAnalyticsService: CohortAnalyticsService;

    constructor() {
        this.prisma = prisma;
        this.cohortAnalyticsService = new CohortAnalyticsService();
    }

    /**
     * Get monetization cohort analysis
     * Uses calculateCohortRetention for cohort structure, then adds revenue metrics
     * This ensures identical performance to the Engagement tab!
     */
    async getMonetizationCohorts(
        gameId: string,
        startDate: Date,
        endDate: Date,
        cohortPeriod: 'day' | 'week' | 'month' = 'day',
        maxDays: number = 30,
        filters?: {
            country?: string | string[];
            platform?: string | string[];
            version?: string | string[];
        }
    ): Promise<MonetizationCohortData[]> {
        try {
            logger.info(`[Monetization] Fetching cohorts using optimized retention service`);

            // Step 1: Get cohort structure from the already-optimized retention service
            // This gives us cohort dates, user counts, and returning users per day
            const retentionCohorts = await this.cohortAnalyticsService.calculateCohortRetention(
                gameId,
                startDate,
                endDate,
                {
                    country: filters?.country,
                    platform: filters?.platform,
                    version: filters?.version,
                    days: Array.from({ length: maxDays + 1 }, (_, i) => i) // [0, 1, 2, ..., maxDays]
                }
            );

            if (retentionCohorts.length === 0) {
                logger.info('[Monetization] No cohorts found');
                return [];
            }

            logger.info(`[Monetization] Got ${retentionCohorts.length} cohorts from retention service`);

            // Step 2: Get all user IDs grouped by install date
            const whereClause: any = {
                gameId,
                createdAt: { gte: startDate, lte: endDate }
            };

            if (filters?.country) {
                whereClause.events = {
                    some: {
                        countryCode: Array.isArray(filters.country) ? { in: filters.country } : filters.country
                    }
                };
            }

            if (filters?.platform) {
                if (!whereClause.events) whereClause.events = { some: {} };
                whereClause.events.some.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                if (!whereClause.events) whereClause.events = { some: {} };
                whereClause.events.some.appVersion = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            const users = await this.prisma.user.findMany({
                where: whereClause,
                select: { id: true, createdAt: true }
            });

            // Group users by install date
            const usersByDate = new Map<string, string[]>();
            users.forEach(user => {
                const timestamp = typeof user.createdAt === 'bigint' ? Number(user.createdAt) : user.createdAt;
                const installDate = new Date(timestamp).toISOString().split('T')[0];
                if (installDate) {
                    if (!usersByDate.has(installDate)) {
                        usersByDate.set(installDate, []);
                    }
                    usersByDate.get(installDate)!.push(user.id);
                }
            });

            // Step 3: Batch fetch ALL revenue events (single query!)
            const allUserIds = Array.from(usersByDate.values()).flat();
            const allRevenue = await this.prisma.revenue.findMany({
                where: {
                    gameId,
                    userId: { in: allUserIds },
                    timestamp: {
                        gte: startDate,
                        lte: new Date(endDate.getTime() + maxDays * 24 * 60 * 60 * 1000)
                    }
                },
                select: {
                    userId: true,
                    timestamp: true,
                    revenue: true,
                    revenueUSD: true,  // Use USD-converted values for aggregation
                    revenueType: true
                }
            });

            logger.info(`[Monetization] Fetched ${allRevenue.length} revenue events for ${allUserIds.length} users`);

            // Step 4: Build monetization data by layering revenue on top of retention cohorts
            const monetizationData: MonetizationCohortData[] = [];
            const now = new Date();

            for (const cohort of retentionCohorts) {
                const cohortDate = cohort.installDate;
                const cohortStartDate = new Date(cohortDate + 'T00:00:00.000Z');
                const cohortUserIds = usersByDate.get(cohortDate) || [];

                const metrics: MonetizationCohortData['metrics'] = {};

                for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
                    const periodStart = new Date(cohortStartDate);
                    periodStart.setUTCDate(periodStart.getUTCDate() + dayOffset);
                    periodStart.setUTCHours(0, 0, 0, 0);

                    const periodEnd = new Date(periodStart);
                    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
                    periodEnd.setUTCHours(0, 0, 0, 0);

                    // Check if day has been reached (same logic as retention)
                    if (periodStart > now) {
                        metrics[`day${dayOffset}`] = {
                            returningUsers: -1,
                            iapRevenue: -1,
                            adRevenue: -1,
                            totalRevenue: -1,
                            iapPayingUsers: -1,
                            arpuIap: -1,
                            arppuIap: -1,
                            arpu: -1,
                            conversionRate: -1
                        };
                        continue;
                    }

                    // Get returning user count from retention data (no extra query needed!)
                    const returningUsers = cohort.userCountByDay[dayOffset] || 0;

                    if (returningUsers === 0) {
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

                    // Filter revenue events in-memory (super fast!)
                    let iapRevenue = 0;
                    let adRevenue = 0;
                    const iapPayingUserIds = new Set<string>();

                    allRevenue
                        .filter(r =>
                            cohortUserIds.includes(r.userId) &&
                            r.timestamp >= periodStart &&
                            r.timestamp < periodEnd
                        )
                        .forEach(item => {
                            // IMPORTANT: ONLY use revenueUSD for multi-currency aggregation
                            // DO NOT fall back to 'revenue' as it's in original currency (e.g., TRY, EUR)
                            // which would inflate USD calculations
                            const revenue = Number(item.revenueUSD || 0);

                            if (item.revenueType === 'IN_APP_PURCHASE') {
                                iapRevenue += revenue;
                                iapPayingUserIds.add(item.userId);
                            } else if (item.revenueType === 'AD_IMPRESSION') {
                                adRevenue += revenue;
                            }
                        });

                    const totalRevenue = iapRevenue + adRevenue;
                    const iapPayingUsers = iapPayingUserIds.size;
                    const arpuIap = returningUsers > 0 ? iapRevenue / returningUsers : 0;
                    const arppuIap = iapPayingUsers > 0 ? iapRevenue / iapPayingUsers : 0;
                    const arpu = returningUsers > 0 ? totalRevenue / returningUsers : 0;
                    const conversionRate = returningUsers > 0 ? (iapPayingUsers / returningUsers) * 100 : 0;

                    metrics[`day${dayOffset}`] = {
                        returningUsers,
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

                monetizationData.push({
                    cohortDate,
                    cohortSize: cohort.installCount,
                    metrics
                });
            }

            logger.info(`[Monetization] Generated ${monetizationData.length} cohorts with revenue metrics`);
            return monetizationData;

        } catch (error) {
            logger.error('[Monetization] Error generating cohorts:', error);
            throw error;
        }
    }
}