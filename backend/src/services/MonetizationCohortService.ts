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
            ltv: number;
            iapPayingUsers: number;
            cumulativePayers: number;
            payerRatio: number;
            arpuIap: number;
            arppuIap: number;
            arpu: number;
            conversionRate: number;
        };
    };
}

export interface MonetizationCohortSummary {
    payerRatio: {
        day1: number;
        day3: number;
        day7: number;
    };
}

export interface MonetizationCohortResponse {
    cohorts: MonetizationCohortData[];
    summary: MonetizationCohortSummary;
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
    ): Promise<MonetizationCohortResponse> {
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
                return {
                    cohorts: [],
                    summary: {
                        payerRatio: { day1: 0, day3: 0, day7: 0 }
                    }
                };
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

            const payerRows = await this.prisma.cohortPayersDaily.findMany({
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
                    newPayers: true
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

            const newPayersByInstallDay = new Map<string, Map<number, number>>();
            for (const row of payerRows) {
                const installDate = row.installDate.toISOString().split('T')[0];
                if (!installDate) continue;
                if (!newPayersByInstallDay.has(installDate)) {
                    newPayersByInstallDay.set(installDate, new Map());
                }
                const dayMap = newPayersByInstallDay.get(installDate)!;
                dayMap.set(row.dayIndex, (dayMap.get(row.dayIndex) || 0) + (row.newPayers || 0));
            }

            // Step 2: Build monetization data from rollups + retention returning users
            const monetizationData: MonetizationCohortData[] = [];

            for (const cohort of retentionCohorts) {
                const cohortDate = cohort.installDate;
                const dayMap = monetizationByInstallDay.get(cohortDate) || new Map();
                const payerDayMap = newPayersByInstallDay.get(cohortDate) || new Map();
                let cumulativeRevenue = 0;
                let cumulativePayers = 0;

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
                            ltv: -1,
                            iapPayingUsers: -1,
                            cumulativePayers: -1,
                            payerRatio: -1,
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
                            ltv: 0,
                            iapPayingUsers: 0,
                            cumulativePayers: 0,
                            payerRatio: 0,
                            arpuIap: 0,
                            arppuIap: 0,
                            arpu: 0,
                            conversionRate: 0
                        };
                        continue;
                    }

                    const rollup = dayMap.get(dayOffset);
                    const newPayers = payerDayMap.get(dayOffset) || 0;
                    const iapRevenue = rollup?.iapRevenue || 0;
                    const adRevenue = rollup?.adRevenue || 0;
                    const totalRevenue = rollup?.totalRevenue || 0;
                    const iapPayingUsers = rollup?.iapPayingUsers || 0;
                    const arpuIap = returningUsers > 0 ? iapRevenue / returningUsers : 0;
                    const arppuIap = iapPayingUsers > 0 ? iapRevenue / iapPayingUsers : 0;
                    const arpu = returningUsers > 0 ? totalRevenue / returningUsers : 0;
                    const conversionRate = returningUsers > 0 ? (iapPayingUsers / returningUsers) * 100 : 0;
                    cumulativeRevenue += totalRevenue;
                    cumulativePayers += newPayers;
                    const ltv = cohort.installCount > 0 ? cumulativeRevenue / cohort.installCount : 0;
                    const payerRatio = cohort.installCount > 0 ? (cumulativePayers / cohort.installCount) * 100 : 0;

                    metrics[`day${dayOffset}`] = {
                        returningUsers,
                        iapRevenue: Math.round(iapRevenue * 100) / 100,
                        adRevenue: Math.round(adRevenue * 100) / 100,
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        ltv: Math.round(ltv * 100) / 100,
                        iapPayingUsers,
                        cumulativePayers,
                        payerRatio: Math.round(payerRatio * 100) / 100,
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

            const summaryDays = [1, 3, 7] as const;
            const payerRatioSummary = {
                day1: 0,
                day3: 0,
                day7: 0
            };

            for (const day of summaryDays) {
                let cohortSizeTotal = 0;
                let cumulativePayersTotal = 0;

                for (const cohort of monetizationData) {
                    const point = cohort.metrics[`day${day}`];
                    if (!point || point.payerRatio < 0 || point.cumulativePayers < 0) continue;
                    cohortSizeTotal += cohort.cohortSize;
                    cumulativePayersTotal += point.cumulativePayers;
                }

                const ratio = cohortSizeTotal > 0 ? (cumulativePayersTotal / cohortSizeTotal) * 100 : 0;
                payerRatioSummary[`day${day}`] = Math.round(ratio * 100) / 100;
            }

            logger.info(`[Monetization] Generated ${monetizationData.length} cohorts with revenue metrics`);
            return {
                cohorts: monetizationData,
                summary: {
                    payerRatio: payerRatioSummary
                }
            };

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
