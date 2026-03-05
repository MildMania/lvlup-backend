import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';
import { CohortAnalyticsService } from './CohortAnalyticsService';
import clickHouseService from './ClickHouseService';

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

    private readFromClickHouse(): boolean {
        return (
            process.env.ANALYTICS_READ_MONETIZATION_COHORTS_FROM_CLICKHOUSE === '1' ||
            process.env.ANALYTICS_READ_MONETIZATION_COHORTS_FROM_CLICKHOUSE === 'true'
        );
    }

    private isClickHouseStrict(): boolean {
        return (
            process.env.ANALYTICS_CLICKHOUSE_STRICT === '1' ||
            process.env.ANALYTICS_CLICKHOUSE_STRICT === 'true'
        );
    }

    private quoteClickHouseString(value: string): string {
        const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${escaped}'`;
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
            if (this.readFromClickHouse() && this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
                throw new Error('ClickHouse strict mode enabled for monetization cohorts, but ClickHouse is not configured/enabled in API env');
            }
            if (this.readFromClickHouse() && clickHouseService.isEnabled()) {
                try {
                    return await this.getMonetizationCohortsFromClickHouse(
                        gameId,
                        startDate,
                        endDate,
                        maxDays,
                        filters
                    );
                } catch (clickHouseError) {
                    if (this.isClickHouseStrict()) throw clickHouseError;
                    logger.warn('[Monetization] ClickHouse monetization cohorts read failed; falling back to Postgres', {
                        gameId,
                        error: clickHouseError instanceof Error ? clickHouseError.message : String(clickHouseError),
                    });
                }
            }

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

    private buildSummary(cohorts: MonetizationCohortData[]): MonetizationCohortSummary {
        const summaryDays = [1, 3, 7] as const;
        const payerRatioSummary = { day1: 0, day3: 0, day7: 0 };

        for (const day of summaryDays) {
            let cohortSizeTotal = 0;
            let cumulativePayersTotal = 0;

            for (const cohort of cohorts) {
                const point = cohort.metrics[`day${day}`];
                if (!point || point.payerRatio < 0 || point.cumulativePayers < 0) continue;
                cohortSizeTotal += cohort.cohortSize;
                cumulativePayersTotal += point.cumulativePayers;
            }

            const ratio = cohortSizeTotal > 0 ? (cumulativePayersTotal / cohortSizeTotal) * 100 : 0;
            payerRatioSummary[`day${day}`] = Math.round(ratio * 100) / 100;
        }

        return { payerRatio: payerRatioSummary };
    }

    private async getMonetizationCohortsFromClickHouse(
        gameId: string,
        startDate: Date,
        endDate: Date,
        maxDays: number,
        filters?: {
            country?: string | string[];
            platform?: string | string[];
            version?: string | string[];
        }
    ): Promise<MonetizationCohortResponse> {
        const dayIndices = Array.from({ length: maxDays + 1 }, (_, i) => i);
        const q = (value: string) => this.quoteClickHouseString(value);
        const qGameId = q(gameId);
        const startDay = startDate.toISOString().slice(0, 10);
        const endDay = endDate.toISOString().slice(0, 10);
        const platformFilter = this.normalizeFilter(filters?.platform);
        const countryFilter = this.normalizeFilter(filters?.country);
        const versionFilter = this.normalizeFilter(filters?.version);

        const filterClauses: string[] = [];
        if (platformFilter.length > 0) {
            filterClauses.push(`platform IN (${platformFilter.map(q).join(',')})`);
        }
        if (countryFilter.length > 0) {
            filterClauses.push(`countryCode IN (${countryFilter.map(q).join(',')})`);
        }
        if (versionFilter.length > 0) {
            filterClauses.push(`appVersion IN (${versionFilter.map(q).join(',')})`);
        }
        const retentionDimsWhere = filterClauses.length ? ` AND ${filterClauses.join(' AND ')}` : '';

        const retentionRows = await clickHouseService.query<Array<{
            installDate: string;
            dayIndex: number;
            cohortSize: number;
            retainedUsers: number;
        }>[number]>(`
            SELECT
                toDate(installDate) AS installDate,
                dayIndex,
                toInt64(sum(cohortSize)) AS cohortSize,
                toInt64(sum(retainedUsers)) AS retainedUsers
            FROM cohort_retention_daily_raw
            WHERE gameId = ${qGameId}
              AND toDate(installDate) >= toDate(${q(startDay)})
              AND toDate(installDate) <= toDate(${q(endDay)})
              AND dayIndex IN (${dayIndices.join(',')})
              ${retentionDimsWhere}
            GROUP BY installDate, dayIndex
            ORDER BY installDate ASC, dayIndex ASC
        `);

        if (retentionRows.length === 0) {
            return {
                cohorts: [],
                summary: { payerRatio: { day1: 0, day3: 0, day7: 0 } }
            };
        }

        const byInstallDate = new Map<string, Map<number, { cohortSize: number; retainedUsers: number }>>();
        for (const row of retentionRows) {
            const installDate = String(row.installDate);
            if (!byInstallDate.has(installDate)) byInstallDate.set(installDate, new Map());
            byInstallDate.get(installDate)!.set(Number(row.dayIndex), {
                cohortSize: Number(row.cohortSize || 0),
                retainedUsers: Number(row.retainedUsers || 0),
            });
        }

        const userFilterClauses: string[] = [];
        if (platformFilter.length > 0) userFilterClauses.push(`u.platform IN (${platformFilter.map(q).join(',')})`);
        if (countryFilter.length > 0) userFilterClauses.push(`u.countryCode IN (${countryFilter.map(q).join(',')})`);
        if (versionFilter.length > 0) userFilterClauses.push(`u.appVersion IN (${versionFilter.map(q).join(',')})`);
        const usersWhere = userFilterClauses.length ? ` AND ${userFilterClauses.join(' AND ')}` : '';

        const monetizationRows = await clickHouseService.query<Array<{
            installDate: string;
            dayIndex: number;
            iapRevenue: number;
            adRevenue: number;
            totalRevenue: number;
            iapPayingUsers: number;
        }>[number]>(`
            WITH users_min AS (
                SELECT
                    gameId,
                    id AS userId,
                    toDate(min(createdAt)) AS installDate,
                    argMin(ifNull(platform, ''), createdAt) AS platform,
                    argMin(ifNull(country, ''), createdAt) AS countryCode,
                    argMin(ifNull(version, ''), createdAt) AS appVersion
                FROM users_raw
                WHERE gameId = ${qGameId}
                GROUP BY gameId, id
            )
            SELECT
                u.installDate AS installDate,
                dateDiff('day', u.installDate, toDate(r.timestamp)) AS dayIndex,
                toFloat64(sumIf(r.revenueUSD, r.revenueType = 'IN_APP_PURCHASE')) AS iapRevenue,
                toFloat64(sumIf(r.revenueUSD, r.revenueType = 'AD_IMPRESSION')) AS adRevenue,
                toFloat64(sum(r.revenueUSD)) AS totalRevenue,
                toInt64(uniqExactIf(r.userId, r.revenueType = 'IN_APP_PURCHASE')) AS iapPayingUsers
            FROM revenue_raw r
            INNER JOIN users_min u
              ON u.gameId = r.gameId
             AND u.userId = r.userId
            WHERE r.gameId = ${qGameId}
              AND u.installDate >= toDate(${q(startDay)})
              AND u.installDate <= toDate(${q(endDay)})
              AND toDate(r.timestamp) >= u.installDate
              AND dateDiff('day', u.installDate, toDate(r.timestamp)) >= 0
              AND dateDiff('day', u.installDate, toDate(r.timestamp)) <= ${maxDays}
              ${usersWhere}
            GROUP BY installDate, dayIndex
        `);

        const payerRows = await clickHouseService.query<Array<{
            installDate: string;
            dayIndex: number;
            newPayers: number;
        }>[number]>(`
            WITH
              users_min AS (
                SELECT
                    gameId,
                    id AS userId,
                    toDate(min(createdAt)) AS installDate,
                    argMin(ifNull(platform, ''), createdAt) AS platform,
                    argMin(ifNull(country, ''), createdAt) AS countryCode,
                    argMin(ifNull(version, ''), createdAt) AS appVersion
                FROM users_raw
                WHERE gameId = ${qGameId}
                GROUP BY gameId, id
              ),
              first_iap AS (
                SELECT
                    gameId,
                    userId,
                    min(toDate(timestamp)) AS firstIapDate
                FROM revenue_raw
                WHERE gameId = ${qGameId}
                  AND revenueType = 'IN_APP_PURCHASE'
                GROUP BY gameId, userId
              )
            SELECT
                u.installDate AS installDate,
                dateDiff('day', u.installDate, f.firstIapDate) AS dayIndex,
                toInt64(count()) AS newPayers
            FROM users_min u
            INNER JOIN first_iap f
              ON f.gameId = u.gameId
             AND f.userId = u.userId
            WHERE u.installDate >= toDate(${q(startDay)})
              AND u.installDate <= toDate(${q(endDay)})
              AND f.firstIapDate >= u.installDate
              AND dateDiff('day', u.installDate, f.firstIapDate) >= 0
              AND dateDiff('day', u.installDate, f.firstIapDate) <= ${maxDays}
              ${usersWhere}
            GROUP BY installDate, dayIndex
        `);

        const monetizationByInstallDay = new Map<string, Map<number, {
            iapRevenue: number;
            adRevenue: number;
            totalRevenue: number;
            iapPayingUsers: number;
        }>>();
        for (const row of monetizationRows) {
            const installDate = String(row.installDate);
            if (!monetizationByInstallDay.has(installDate)) {
                monetizationByInstallDay.set(installDate, new Map());
            }
            monetizationByInstallDay.get(installDate)!.set(Number(row.dayIndex), {
                iapRevenue: Number(row.iapRevenue || 0),
                adRevenue: Number(row.adRevenue || 0),
                totalRevenue: Number(row.totalRevenue || 0),
                iapPayingUsers: Number(row.iapPayingUsers || 0),
            });
        }

        const newPayersByInstallDay = new Map<string, Map<number, number>>();
        for (const row of payerRows) {
            const installDate = String(row.installDate);
            if (!newPayersByInstallDay.has(installDate)) {
                newPayersByInstallDay.set(installDate, new Map());
            }
            newPayersByInstallDay.get(installDate)!.set(Number(row.dayIndex), Number(row.newPayers || 0));
        }

        const monetizationData: MonetizationCohortData[] = [];
        const sortedInstallDates = Array.from(byInstallDate.keys()).sort();
        const endDayMs = Date.UTC(
            Number(endDay.slice(0, 4)),
            Number(endDay.slice(5, 7)) - 1,
            Number(endDay.slice(8, 10))
        );

        for (const cohortDate of sortedInstallDates) {
            const dayMap = byInstallDate.get(cohortDate) || new Map();
            const installCount = Number(dayMap.get(0)?.cohortSize || Math.max(...Array.from(dayMap.values()).map((d) => d.cohortSize), 0));
            const monetizationDayMap = monetizationByInstallDay.get(cohortDate) || new Map();
            const payerDayMap = newPayersByInstallDay.get(cohortDate) || new Map();
            let cumulativeRevenue = 0;
            let cumulativePayers = 0;

            const metrics: MonetizationCohortData['metrics'] = {};
            const installMs = Date.UTC(
                Number(cohortDate.slice(0, 4)),
                Number(cohortDate.slice(5, 7)) - 1,
                Number(cohortDate.slice(8, 10))
            );

            for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
                const targetMs = installMs + dayOffset * 24 * 60 * 60 * 1000;
                const isFuture = targetMs > endDayMs;
                const retainedUsers = Number(dayMap.get(dayOffset)?.retainedUsers || 0);
                const retentionValue = isFuture
                    ? -1
                    : (installCount > 0 ? Math.round((retainedUsers / installCount) * 1000) / 10 : 0);

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

                if (retainedUsers === 0) {
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

                const rollup = monetizationDayMap.get(dayOffset);
                const newPayers = payerDayMap.get(dayOffset) || 0;
                const iapRevenue = rollup?.iapRevenue || 0;
                const adRevenue = rollup?.adRevenue || 0;
                const totalRevenue = rollup?.totalRevenue || 0;
                const iapPayingUsers = rollup?.iapPayingUsers || 0;

                cumulativeRevenue += totalRevenue;
                cumulativePayers += newPayers;

                const ltv = installCount > 0 ? cumulativeRevenue / installCount : 0;
                const payerRatio = installCount > 0 ? (cumulativePayers / installCount) * 100 : 0;
                const arpuIap = retainedUsers > 0 ? iapRevenue / retainedUsers : 0;
                const arppuIap = iapPayingUsers > 0 ? iapRevenue / iapPayingUsers : 0;
                const arpu = retainedUsers > 0 ? totalRevenue / retainedUsers : 0;
                const conversionRate = retainedUsers > 0 ? (iapPayingUsers / retainedUsers) * 100 : 0;

                metrics[`day${dayOffset}`] = {
                    returningUsers: retainedUsers,
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
                cohortSize: installCount,
                metrics
            });
        }

        return {
            cohorts: monetizationData,
            summary: this.buildSummary(monetizationData)
        };
    }
}
