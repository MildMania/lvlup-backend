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
            logger.info(`[Monetization] Fetching cohorts from retention+monetization rollups`);

            const dayIndices = Array.from({ length: maxDays + 1 }, (_, i) => i);

            // Step 1: Cohort structure and returning users from retention rollups
            const retentionCohorts = await this.cohortAnalyticsService.calculateCohortRetention(
                gameId,
                startDate,
                endDate,
                {
                    country: filters?.country,
                    platform: filters?.platform,
                    version: filters?.version,
                    days: dayIndices
                }
            );

            if (retentionCohorts.length === 0) {
                logger.info('[Monetization] No cohorts found');
                return [];
            }

            const platformFilter = this.normalizeFilter(filters?.platform);
            const countryFilter = this.normalizeFilter(filters?.country);
            const versionFilter = this.normalizeFilter(filters?.version);

            const monetizationRows = await this.prisma.cohortMonetizationDaily.findMany({
                where: {
                    gameId,
                    installDate: { gte: startDate, lte: endDate },
                    dayIndex: { in: dayIndices },
                    ...(platformFilter.length ? { platform: { in: platformFilter } } : {}),
                    ...(countryFilter.length ? { countryCode: { in: countryFilter } } : {}),
                    ...(versionFilter.length ? { appVersion: { in: versionFilter } } : {})
                },
                select: {
                    installDate: true,
                    dayIndex: true,
                    iapRevenueUsd: true,
                    adRevenueUsd: true,
                    totalRevenueUsd: true,
                    iapPayingUsers: true
                }
            });

            const monetizationByInstallDay = new Map<string, Map<number, {
                iapRevenue: number;
                adRevenue: number;
                totalRevenue: number;
                iapPayingUsers: number;
            }>>();

            for (const row of monetizationRows) {
                const installDate = row.installDate.toISOString().split('T')[0];
                if (!installDate) continue;
                if (!monetizationByInstallDay.has(installDate)) {
                    monetizationByInstallDay.set(installDate, new Map());
                }
                const dayMap = monetizationByInstallDay.get(installDate)!;
                const current = dayMap.get(row.dayIndex);

                if (current) {
                    current.iapRevenue += row.iapRevenueUsd || 0;
                    current.adRevenue += row.adRevenueUsd || 0;
                    current.totalRevenue += row.totalRevenueUsd || 0;
                    current.iapPayingUsers += row.iapPayingUsers || 0;
                } else {
                    dayMap.set(row.dayIndex, {
                        iapRevenue: row.iapRevenueUsd || 0,
                        adRevenue: row.adRevenueUsd || 0,
                        totalRevenue: row.totalRevenueUsd || 0,
                        iapPayingUsers: row.iapPayingUsers || 0
                    });
                }
            }

            // Step 2: Build monetization data from rollups + retention returning users
            const monetizationData: MonetizationCohortData[] = [];

            for (const cohort of retentionCohorts) {
                const cohortDate = cohort.installDate;
                const dayMap = monetizationByInstallDay.get(cohortDate) || new Map();

                const metrics: MonetizationCohortData['metrics'] = {};

                for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
                    const retentionValue = cohort.retentionByDay[dayOffset];
                    const returningUsers = cohort.userCountByDay[dayOffset] || 0;

                    if (retentionValue === -1) {
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

                    const rollup = dayMap.get(dayOffset);
                    const iapRevenue = rollup?.iapRevenue || 0;
                    const adRevenue = rollup?.adRevenue || 0;
                    const totalRevenue = rollup?.totalRevenue || 0;
                    const iapPayingUsers = rollup?.iapPayingUsers || 0;
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

    private normalizeFilter(value?: string | string[]): string[] {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter((v) => v && v !== 'All');
        return value.split(',').map((v) => v.trim()).filter((v) => v && v !== 'All');
    }
}
