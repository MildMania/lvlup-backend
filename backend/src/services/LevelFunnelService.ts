import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';
import levelMetricsAggregationService from './LevelMetricsAggregationService';

interface LevelFunnelFilters {
    gameId: string;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    installStartDate?: Date | undefined;
    installEndDate?: Date | undefined;
    country?: string | undefined;
    platform?: string | undefined;
    version?: string | undefined;
    abTestId?: string | undefined;
    variantId?: string | undefined; // For filtering by specific AB test variant
    levelFunnel?: string | undefined; // e.g., "live_v1" or "live_v1,live_v2"
    levelFunnelVersion?: string | number | undefined; // e.g., 15 or "15,16" for paired selections
    levelLimit?: number | undefined; // Maximum number of levels to return (default: 100)
    includeRawUserCounts?: boolean | undefined; // Include raw user counts for multi-day ranges (expensive)
}

interface LevelMetrics {
    levelId: number;
    levelName?: string;
    startedPlayers: number;
    completedPlayers: number;
    starts: number;
    completes: number;
    fails: number;
    winRate: number; // (Completed levels / (Completed + Failed levels)) × 100 - excludes users who only started
    completionRate: number; // (unique players completed / unique players started) × 100
    failRate: number;
    funnelRate: number; // (Nth level completed users / 1st level started users) × 100
    churnTotal: number; // Total churn rate
    churnStartComplete: number;
    churnCompleteNext: number;
    churnD3?: number | null; // % of D7-eligible starters not completed by D3 (same denominator as D7)
    churnD7?: number | null; // % of D7-eligible starters not completed by D7
    aps: number; // Attempts per success: starts / completes
    apsRaw?: number; // Backward compatibility: same as aps (deprecated, use aps instead)
    apsClean?: number; // Backward compatibility: always 0 (deprecated)
    meanCompletionDuration: number;
    meanFailDuration: number;
    cumulativeAvgTime: number; // Cumulative average time from level 1 to current level
    boosterUsage: number;
    egpRate: number;
    customMetrics: Record<string, any>;
}

export class LevelFunnelService {
    /**
     * Get level funnel data with all metrics (FAST VERSION using pre-aggregated data)
     * Uses hybrid approach: aggregated data for event counts + raw events for unique user counts
     */
    async getLevelFunnelDataFast(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        try {
            const {
                gameId,
                startDate,
                endDate,
                installStartDate,
                installEndDate,
                country,
                platform,
                version,
                levelFunnel,
                levelFunnelVersion,
                levelLimit = 100
            } = filters;

            if (country || version) {
                logger.warn('Level funnel rollups ignore country/appVersion filters to reduce rollup cardinality', {
                    gameId,
                    countryFilterProvided: !!country,
                    appVersionFilterProvided: !!version
                });
            }

            logger.info(`Starting FAST level funnel query (hybrid) for game ${gameId}`);
            const queryStart = Date.now();

            // Determine date ranges
            const now = new Date();
            const today = new Date(now);
            today.setUTCHours(0, 0, 0, 0);
            
            const start = startDate || new Date(0);
            const end = endDate || new Date();

            // Check if query includes today (today's data is not yet aggregated)
            const queryIncludesToday = end >= today;
            
            // Determine if we're querying multiple days
            const daysDifference = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
            const isMultipleDays = daysDifference > 1;
            
            const hasInstallCohortFilter = !!(installStartDate || installEndDate);


            // Ensure today's aggregation exists when range includes today
            if (queryIncludesToday) {
                await this.ensureDailyAggregation(gameId, today);
            }

            // Install-date filtering is a user-cohort constraint.
            // Pre-aggregated `level_metrics_daily` cannot be filtered by install date without losing correctness,
            // so we switch to aggregating from `level_metrics_daily_users` (per-user daily aggregates) and
            // apply the install-date filter via a join to `users`.
            //
            // Note: We intentionally disable "today raw" in this mode because today's per-user aggregates are only
            // as fresh as the most recent aggregation snapshot.
            if (hasInstallCohortFilter) {
                const cohortMetrics = await this.queryAggregatedMetricsFromDailyUsers(
                    gameId,
                    start,
                    end,
                    {
                        country,
                        platform,
                        version,
                        levelFunnel,
                        levelFunnelVersion,
                        installStartDate,
                        installEndDate
                    }
                );

                const merged = new Map<number, any>();
                for (const row of cohortMetrics) {
                    merged.set(row.levelId, {
                        levelId: row.levelId,
                        starts: row.starts,
                        completes: row.completes,
                        fails: row.fails,
                        startedPlayers: row.startedPlayers,
                        completedPlayers: row.completedPlayers,
                        boosterUsers: row.boosterUsers,
                        totalBoosterUsage: 0,
                        egpUsers: row.egpUsers,
                        totalEgpUsage: 0,
                        totalCompletionDuration: BigInt(row.totalCompletionDuration || 0),
                        completionCount: row.completionCount,
                        totalFailDuration: BigInt(row.totalFailDuration || 0),
                        failCount: row.failCount
                    });
                }

                const levelMetrics = this.calculateDerivedMetrics(merged, levelLimit);
                await this.mergeHorizonChurnMetrics(levelMetrics, {
                    gameId,
                    startDate: start,
                    endDate: end,
                    installStartDate,
                    installEndDate,
                    platform,
                    levelFunnel,
                    levelFunnelVersion
                });
                const totalDuration = Date.now() - queryStart;
                logger.info(
                    `FAST level funnel (install cohort) completed in ${totalDuration}ms (${levelMetrics.length} levels, includes today: ${queryIncludesToday}, today raw: false)`
                );
                return levelMetrics;
            }

            // Query pre-aggregated data for event counts (all days)
            const aggregatedMetrics = await this.queryAggregatedMetrics(gameId, start, end, {
                country,
                platform,
                version,
                levelFunnel,
                levelFunnelVersion
            });
            

            // Get accurate unique user counts from daily user rows (exact across days)
            let userCountsByLevel: Map<number, {
                startedPlayers: number;
                completedPlayers: number;
                boosterUsers: number;
                egpUsers: number;
            }> | null = null;

            if (isMultipleDays) {
                userCountsByLevel = await this.queryDailyUserCounts(gameId, start, end, {
                    country,
                    platform,
                    version,
                    levelFunnel,
                    levelFunnelVersion
                });
            }

            // Group by levelId and sum event counts from aggregated data
            const grouped = new Map<number, any>();
            
            // Process aggregated historical data
            for (const row of aggregatedMetrics) {
                if (!grouped.has(row.levelId)) {
                    grouped.set(row.levelId, {
                        levelId: row.levelId,
                        starts: 0,
                        completes: 0,
                        fails: 0,
                        startedPlayers: 0, // Will be replaced with raw event counts for multi-day
                        completedPlayers: 0, // Will be replaced with raw event counts for multi-day
                        boosterUsers: 0, // Will be replaced with raw event counts for multi-day
                        totalBoosterUsage: 0,
                        egpUsers: 0, // Will be replaced with raw event counts for multi-day
                        totalEgpUsage: 0,
                        totalCompletionDuration: BigInt(0),
                        completionCount: 0,
                        totalFailDuration: BigInt(0),
                        failCount: 0
                    });
                }

                const group = grouped.get(row.levelId)!;
                // Sum event counts (accurate across days)
                group.starts += row.starts;
                group.completes += row.completes;
                group.fails += row.fails;
                group.totalBoosterUsage += row.totalBoosterUsage;
                group.totalEgpUsage += row.totalEgpUsage;
                group.totalCompletionDuration += BigInt(row.totalCompletionDuration);
                group.completionCount += row.completionCount;
                group.totalFailDuration += BigInt(row.totalFailDuration);
                group.failCount += row.failCount;
                
                // If single day, sum user counts from aggregated data
                if (!isMultipleDays) {
                    group.startedPlayers += row.startedPlayers;
                    group.completedPlayers += row.completedPlayers;
                    group.boosterUsers += row.boosterUsers;
                    group.egpUsers += row.egpUsers;
                }
            }
            
            const mergedData = grouped;

            // Replace user counts with accurate raw event counts for multi-day queries
            if (userCountsByLevel) {
                for (const [levelId, counts] of userCountsByLevel.entries()) {
                    const group = mergedData.get(levelId);
                    if (group) {
                        group.startedPlayers = counts.startedPlayers;
                        group.completedPlayers = counts.completedPlayers;
                        group.boosterUsers = counts.boosterUsers;
                        group.egpUsers = counts.egpUsers;
                    }
                }
            }

            // Calculate derived metrics
            const levelMetrics = this.calculateDerivedMetrics(mergedData, levelLimit);
            await this.mergeHorizonChurnMetrics(levelMetrics, {
                gameId,
                startDate: start,
                endDate: end,
                installStartDate,
                installEndDate,
                platform,
                levelFunnel,
                levelFunnelVersion
            });

            const totalDuration = Date.now() - queryStart;
            logger.info(`FAST level funnel query completed in ${totalDuration}ms (${levelMetrics.length} levels, ${daysDifference} days, includes today: ${queryIncludesToday})`);

            return levelMetrics;
        } catch (error) {
            logger.error('Error in getLevelFunnelDataFast:', error);
            throw error;
        }
    }

    private async mergeHorizonChurnMetrics(
        levelMetrics: LevelMetrics[],
        params: {
            gameId: string;
            startDate: Date;
            endDate: Date;
            installStartDate?: Date;
            installEndDate?: Date;
            platform?: string;
            levelFunnel?: string;
            levelFunnelVersion?: string | number;
        }
    ): Promise<void> {
        if (levelMetrics.length === 0) return;

        try {
            const churnByLevel = await this.queryHorizonChurnFromRollup(params, levelMetrics.map((m) => m.levelId));
            for (const metric of levelMetrics) {
                const row = churnByLevel.get(metric.levelId);
                metric.churnD3 = row?.churnD3 ?? null;
                metric.churnD7 = row?.churnD7 ?? null;
            }
        } catch (error) {
            // Soft-fail until the new rollup table/migration is deployed.
            logger.warn('Level horizon churn rollup unavailable; returning base level funnel metrics', {
                gameId: params.gameId,
                error: error instanceof Error ? error.message : String(error)
            });
            for (const metric of levelMetrics) {
                metric.churnD3 = null;
                metric.churnD7 = null;
            }
        }
    }

    private async queryHorizonChurnFromRollup(
        params: {
            gameId: string;
            startDate: Date;
            endDate: Date;
            installStartDate?: Date;
            installEndDate?: Date;
            platform?: string;
            levelFunnel?: string;
            levelFunnelVersion?: string | number;
        },
        levelIds: number[]
    ): Promise<Map<number, { churnD3: number | null; churnD7: number | null }>> {
        const { gameId, startDate, endDate, installStartDate, installEndDate, platform, levelFunnel, levelFunnelVersion } = params;
        const platforms = platform ? platform.split(',').map((p) => p.trim()).filter(Boolean) : [];

        let funnelClauses: Prisma.Sql = Prisma.sql``;
        if (levelFunnel) {
            const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
            if (levelFunnelVersion) {
                const funnelVersions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
                if (funnels.length > 0 && funnelVersions.length > 0 && funnels.length === funnelVersions.length) {
                    const pairs = funnels.map((f, idx) => Prisma.sql`(c."levelFunnel" = ${f} AND c."levelFunnelVersion" = ${funnelVersions[idx]})`);
                    funnelClauses = Prisma.sql`AND (${Prisma.join(pairs, ' OR ')})`;
                } else if (funnels.length > 0) {
                    funnelClauses = Prisma.sql`AND c."levelFunnel" IN (${Prisma.join(funnels)})`;
                }
            } else if (funnels.length > 0) {
                funnelClauses = Prisma.sql`AND c."levelFunnel" IN (${Prisma.join(funnels)})`;
            }
        } else if (levelFunnelVersion) {
            const funnelVersions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));
            if (funnelVersions.length > 0) {
                funnelClauses = Prisma.sql`AND c."levelFunnelVersion" IN (${Prisma.join(funnelVersions)})`;
            }
        }

        const installWhere = Prisma.sql`
            ${installStartDate ? Prisma.sql`AND c."installDate" >= ${installStartDate}` : Prisma.sql``}
            ${installEndDate ? Prisma.sql`AND c."installDate" <= ${installEndDate}` : Prisma.sql``}
        `;

        const rows = await prisma.$queryRaw<Array<{ levelId: number; eligibleStarters: bigint; completedByD3: bigint; completedByD7: bigint }>>(Prisma.sql`
            WITH max_available AS (
              SELECT MAX("date")::date AS max_date
              FROM "level_metrics_daily_users"
              WHERE "gameId" = ${gameId}
            )
            SELECT
              c."levelId" AS "levelId",
              COALESCE(SUM(c."starters"), 0)::bigint AS "eligibleStarters",
              COALESCE(SUM(c."completedByD3"), 0)::bigint AS "completedByD3",
              COALESCE(SUM(c."completedByD7"), 0)::bigint AS "completedByD7"
            FROM "level_churn_cohort_daily" c
            CROSS JOIN max_available m
            WHERE c."gameId" = ${gameId}
              AND c."cohortDate" >= ${startDate}
              AND c."cohortDate" <= ${endDate}
              AND c."cohortDate"::date <= (m.max_date - 7)
              AND c."levelId" IN (${Prisma.join(levelIds)})
              ${platforms.length ? Prisma.sql`AND c."platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
              ${funnelClauses}
              ${installWhere}
            GROUP BY c."levelId"
        `);

        const result = new Map<number, { churnD3: number | null; churnD7: number | null }>();
        for (const row of rows) {
            const eligible = Number(row.eligibleStarters || 0);
            if (eligible <= 0) {
                result.set(row.levelId, { churnD3: null, churnD7: null });
                continue;
            }
            const completedByD3 = Number(row.completedByD3 || 0);
            const completedByD7 = Number(row.completedByD7 || 0);
            const churnD3 = ((eligible - completedByD3) / eligible) * 100;
            const churnD7 = ((eligible - completedByD7) / eligible) * 100;
            result.set(row.levelId, {
                churnD3: Math.round(churnD3 * 100) / 100,
                churnD7: Math.round(churnD7 * 100) / 100
            });
        }
        return result;
    }

    private async queryAggregatedMetricsFromDailyUsers(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters: {
            country?: string;
            platform?: string;
            version?: string;
            levelFunnel?: string;
            levelFunnelVersion?: string | number;
            installStartDate?: Date;
            installEndDate?: Date;
        }
    ): Promise<Array<{
        levelId: number;
        starts: number;
        completes: number;
        fails: number;
        startedPlayers: number;
        completedPlayers: number;
        boosterUsers: number;
        egpUsers: number;
        totalCompletionDuration: any;
        completionCount: number;
        totalFailDuration: any;
        failCount: number;
    }>> {
        const countries: string[] = [];
        const platforms = filters.platform
            ? filters.platform.split(',').map(p => p.trim()).filter(p => p)
            : [];
        const versions: string[] = [];

        let funnelClauses: any = Prisma.sql``;
        if (filters.levelFunnel) {
            const funnels = filters.levelFunnel.split(',').map(f => f.trim()).filter(f => f);
            if (filters.levelFunnelVersion) {
                const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                if (funnels.length === 1 && funnelVersions.length === 1) {
                    funnelClauses = Prisma.sql`AND l.\"levelFunnel\" = ${funnels[0]} AND l.\"levelFunnelVersion\" = ${funnelVersions[0]}`;
                } else if (funnels.length > 0 && funnelVersions.length > 0 && funnels.length === funnelVersions.length) {
                    const pairs = funnels.map((funnel, idx) => Prisma.sql`(l.\"levelFunnel\" = ${funnel} AND l.\"levelFunnelVersion\" = ${funnelVersions[idx]})`);
                    funnelClauses = Prisma.sql`AND (${Prisma.join(pairs, ' OR ')})`;
                } else if (funnels.length > 0) {
                    funnelClauses = Prisma.sql`AND l.\"levelFunnel\" IN (${Prisma.join(funnels)})`;
                }
            } else if (funnels.length > 0) {
                funnelClauses = Prisma.sql`AND l.\"levelFunnel\" IN (${Prisma.join(funnels)})`;
            }
        } else if (filters.levelFunnelVersion) {
            const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
            if (funnelVersions.length > 0) {
                funnelClauses = Prisma.sql`AND l.\"levelFunnelVersion\" IN (${Prisma.join(funnelVersions)})`;
            }
        }

        const installClauses: any[] = [];
        if (filters.installStartDate) {
            installClauses.push(Prisma.sql`u.\"createdAt\" >= ${filters.installStartDate}`);
        }
        if (filters.installEndDate) {
            installClauses.push(Prisma.sql`u.\"createdAt\" <= ${filters.installEndDate}`);
        }
        const installWhere = installClauses.length
            ? Prisma.sql`AND ${Prisma.join(installClauses, ' AND ')}`
            : Prisma.sql``;

        const rows = await prisma.$queryRaw<
            Array<{
                levelId: number;
                starts: any;
                completes: any;
                fails: any;
                startedPlayers: bigint;
                completedPlayers: bigint;
                boosterUsers: bigint;
                egpUsers: bigint;
                totalCompletionDuration: any;
                completionCount: any;
                totalFailDuration: any;
                failCount: any;
            }>
        >(Prisma.sql`
            SELECT
                l."levelId" AS "levelId",
                COALESCE(SUM(l."starts"), 0) AS "starts",
                COALESCE(SUM(l."completes"), 0) AS "completes",
                COALESCE(SUM(l."fails"), 0) AS "fails",
                COUNT(DISTINCT l."userId") FILTER (WHERE l."started" = true) AS "startedPlayers",
                COUNT(DISTINCT l."userId") FILTER (WHERE l."completed" = true) AS "completedPlayers",
                COUNT(DISTINCT l."userId") FILTER (WHERE l."boosterUsed" = true) AS "boosterUsers",
                COUNT(DISTINCT l."userId") FILTER (WHERE l."egpUsed" = true) AS "egpUsers",
                COALESCE(SUM(l."totalCompletionDuration"), 0) AS "totalCompletionDuration",
                COALESCE(SUM(l."completionCount"), 0) AS "completionCount",
                COALESCE(SUM(l."totalFailDuration"), 0) AS "totalFailDuration",
                COALESCE(SUM(l."failCount"), 0) AS "failCount"
            FROM "level_metrics_daily_users" l
            INNER JOIN "users" u ON u."id" = l."userId" AND u."gameId" = l."gameId"
            WHERE l."gameId" = ${gameId}
              AND l."date" >= ${startDate}
              AND l."date" <= ${endDate}
              ${installWhere}
              ${countries.length ? Prisma.sql`AND l."countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
              ${platforms.length ? Prisma.sql`AND l."platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
              ${versions.length ? Prisma.sql`AND l."appVersion" IN (${Prisma.join(versions)})` : Prisma.sql``}
              ${funnelClauses}
            GROUP BY l."levelId"
        `);

        return rows.map((r) => ({
            levelId: r.levelId,
            starts: Number(r.starts || 0),
            completes: Number(r.completes || 0),
            fails: Number(r.fails || 0),
            startedPlayers: Number(r.startedPlayers || 0),
            completedPlayers: Number(r.completedPlayers || 0),
            boosterUsers: Number(r.boosterUsers || 0),
            egpUsers: Number(r.egpUsers || 0),
            totalCompletionDuration: r.totalCompletionDuration || 0,
            completionCount: Number(r.completionCount || 0),
            totalFailDuration: r.totalFailDuration || 0,
            failCount: Number(r.failCount || 0)
        }));
    }

    /**
     * Query daily user rows to get exact unique user counts across date ranges
     */
    private async queryDailyUserCounts(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters: {
            country?: string;
            platform?: string;
            version?: string;
            levelFunnel?: string;
            levelFunnelVersion?: string | number;
        }
    ): Promise<Map<number, {
        startedPlayers: number;
        completedPlayers: number;
        boosterUsers: number;
        egpUsers: number;
    }>> {
        const countries: string[] = [];
        const platforms = filters.platform
            ? filters.platform.split(',').map(p => p.trim()).filter(p => p)
            : [];
        const versions: string[] = [];

        let funnelClauses: any = Prisma.sql``;
        if (filters.levelFunnel) {
            const funnels = filters.levelFunnel.split(',').map(f => f.trim()).filter(f => f);
            if (filters.levelFunnelVersion) {
                const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                if (funnels.length === 1 && funnelVersions.length === 1) {
                    funnelClauses = Prisma.sql`AND "levelFunnel" = ${funnels[0]} AND "levelFunnelVersion" = ${funnelVersions[0]}`;
                } else if (funnels.length > 0 && funnelVersions.length > 0 && funnels.length === funnelVersions.length) {
                    const pairs = funnels.map((funnel, idx) => Prisma.sql`("levelFunnel" = ${funnel} AND "levelFunnelVersion" = ${funnelVersions[idx]})`);
                    funnelClauses = Prisma.sql`AND (${Prisma.join(pairs, ' OR ')})`;
                } else if (funnels.length > 0) {
                    funnelClauses = Prisma.sql`AND "levelFunnel" IN (${Prisma.join(funnels)})`;
                }
            } else if (funnels.length > 0) {
                funnelClauses = Prisma.sql`AND "levelFunnel" IN (${Prisma.join(funnels)})`;
            }
        } else if (filters.levelFunnelVersion) {
            const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
            if (funnelVersions.length > 0) {
                funnelClauses = Prisma.sql`AND "levelFunnelVersion" IN (${Prisma.join(funnelVersions)})`;
            }
        }

        const rows = await prisma.$queryRaw<
            Array<{
                levelId: number;
                started: bigint;
                completed: bigint;
                booster: bigint;
                egp: bigint;
            }>
        >(Prisma.sql`
            SELECT
                "levelId" AS "levelId",
                COUNT(DISTINCT "userId") FILTER (WHERE "started" = true) AS started,
                COUNT(DISTINCT "userId") FILTER (WHERE "completed" = true) AS completed,
                COUNT(DISTINCT "userId") FILTER (WHERE "boosterUsed" = true) AS booster,
                COUNT(DISTINCT "userId") FILTER (WHERE "egpUsed" = true) AS egp
            FROM "level_metrics_daily_users"
            WHERE "gameId" = ${gameId}
              AND "date" >= ${startDate}
              AND "date" <= ${endDate}
              ${countries.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
              ${platforms.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
              ${versions.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versions)})` : Prisma.sql``}
              ${funnelClauses}
            GROUP BY "levelId"
        `);

        const result = new Map<number, {
            startedPlayers: number;
            completedPlayers: number;
            boosterUsers: number;
            egpUsers: number;
        }>();

        for (const row of rows) {
            result.set(row.levelId, {
                startedPlayers: Number(row.started || 0),
                completedPlayers: Number(row.completed || 0),
                boosterUsers: Number(row.booster || 0),
                egpUsers: Number(row.egp || 0)
            });
        }

        return result;
    }


    private async ensureDailyAggregation(gameId: string, date: Date): Promise<void> {
        const existing = await prisma.levelMetricsDailyUser.count({
            where: {
                gameId,
                date
            }
        });

        if (existing > 0) {
            return;
        }

        logger.warn(`No daily user metrics for ${gameId} on ${date.toISOString()} - running on-demand aggregation`);
        await levelMetricsAggregationService.aggregateDailyMetrics(gameId, date);
    }

    /**
     * Query pre-aggregated metrics from LevelMetricsDaily
     */
    private async queryAggregatedMetrics(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters: {
            country?: string;
            platform?: string;
            version?: string;
            levelFunnel?: string;
            levelFunnelVersion?: string | number;
        }
    ): Promise<any[]> {
        const countries: string[] = [];
        const platforms = filters.platform
            ? filters.platform.split(',').map(p => p.trim()).filter(p => p)
            : [];
        const versions: string[] = [];

        let funnelClauses: any = Prisma.sql``;
        if (filters.levelFunnel) {
            const funnels = filters.levelFunnel.split(',').map(f => f.trim()).filter(f => f);
            if (filters.levelFunnelVersion) {
                const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                if (funnels.length === 1 && funnelVersions.length === 1) {
                    funnelClauses = Prisma.sql`AND "levelFunnel" = ${funnels[0]} AND "levelFunnelVersion" = ${funnelVersions[0]}`;
                } else if (funnels.length > 0 && funnelVersions.length > 0 && funnels.length === funnelVersions.length) {
                    const pairs = funnels.map((funnel, idx) => Prisma.sql`("levelFunnel" = ${funnel} AND "levelFunnelVersion" = ${funnelVersions[idx]})`);
                    funnelClauses = Prisma.sql`AND (${Prisma.join(pairs, ' OR ')})`;
                } else if (funnels.length > 0) {
                    funnelClauses = Prisma.sql`AND "levelFunnel" IN (${Prisma.join(funnels)})`;
                }
            } else if (funnels.length > 0) {
                funnelClauses = Prisma.sql`AND "levelFunnel" IN (${Prisma.join(funnels)})`;
            }
        } else if (filters.levelFunnelVersion) {
            const funnelVersions = filters.levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
            if (funnelVersions.length > 0) {
                funnelClauses = Prisma.sql`AND "levelFunnelVersion" IN (${Prisma.join(funnelVersions)})`;
            }
        }

        const rows = await prisma.$queryRaw<
            Array<{
                levelId: number;
                starts: bigint;
                completes: bigint;
                fails: bigint;
                startedPlayers: bigint;
                completedPlayers: bigint;
                boosterUsers: bigint;
                totalBoosterUsage: bigint;
                egpUsers: bigint;
                totalEgpUsage: bigint;
                totalCompletionDuration: bigint;
                completionCount: bigint;
                totalFailDuration: bigint;
                failCount: bigint;
            }>
        >(Prisma.sql`
            SELECT
                "levelId" AS "levelId",
                COALESCE(SUM("starts"), 0) AS "starts",
                COALESCE(SUM("completes"), 0) AS "completes",
                COALESCE(SUM("fails"), 0) AS "fails",
                COALESCE(SUM("startedPlayers"), 0) AS "startedPlayers",
                COALESCE(SUM("completedPlayers"), 0) AS "completedPlayers",
                COALESCE(SUM("boosterUsers"), 0) AS "boosterUsers",
                COALESCE(SUM("totalBoosterUsage"), 0) AS "totalBoosterUsage",
                COALESCE(SUM("egpUsers"), 0) AS "egpUsers",
                COALESCE(SUM("totalEgpUsage"), 0) AS "totalEgpUsage",
                COALESCE(SUM("totalCompletionDuration"), 0) AS "totalCompletionDuration",
                COALESCE(SUM("completionCount"), 0) AS "completionCount",
                COALESCE(SUM("totalFailDuration"), 0) AS "totalFailDuration",
                COALESCE(SUM("failCount"), 0) AS "failCount"
            FROM "level_metrics_daily"
            WHERE "gameId" = ${gameId}
              AND "date" >= ${startDate}
              AND "date" <= ${endDate}
              ${countries.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
              ${platforms.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
              ${versions.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versions)})` : Prisma.sql``}
              ${funnelClauses}
            GROUP BY "levelId"
        `);

        return rows.map((row) => ({
            levelId: row.levelId,
            starts: Number(row.starts || 0),
            completes: Number(row.completes || 0),
            fails: Number(row.fails || 0),
            startedPlayers: Number(row.startedPlayers || 0),
            completedPlayers: Number(row.completedPlayers || 0),
            boosterUsers: Number(row.boosterUsers || 0),
            totalBoosterUsage: Number(row.totalBoosterUsage || 0),
            egpUsers: Number(row.egpUsers || 0),
            totalEgpUsage: Number(row.totalEgpUsage || 0),
            totalCompletionDuration: BigInt(row.totalCompletionDuration || 0),
            completionCount: Number(row.completionCount || 0),
            totalFailDuration: BigInt(row.totalFailDuration || 0),
            failCount: Number(row.failCount || 0)
        }));
    }


    /**
     * Calculate derived metrics from merged aggregated data
     * Matches exact logic from calculateLevelMetrics()
     */
    private calculateDerivedMetrics(mergedData: Map<number, any>, levelLimit: number): LevelMetrics[] {
        const levelMetrics: LevelMetrics[] = [];
        
        // Sort levels
        const levelIds = Array.from(mergedData.keys()).sort((a, b) => a - b);

        // Get first level started users for funnel rate
        let firstLevelStartedUsers = 0;
        if (levelIds.length > 0 && levelIds[0] !== undefined) {
            const firstLevel = mergedData.get(levelIds[0]);
            if (firstLevel) {
                firstLevelStartedUsers = firstLevel.startedPlayers;
            }
        }

        // Apply level limit
        const limitedLevelIds = levelIds.slice(0, levelLimit);

        for (let i = 0; i < limitedLevelIds.length; i++) {
            const levelId = limitedLevelIds[i]!;
            const data = mergedData.get(levelId)!;
            const nextLevelId = i < limitedLevelIds.length - 1 ? limitedLevelIds[i + 1] : null;
            const nextLevelData = nextLevelId ? mergedData.get(nextLevelId) : undefined;

            // Defensive: Use 0 if player counts are undefined (old aggregated data)
            const startedPlayers = data.startedPlayers || 0;
            const completedPlayers = data.completedPlayers || 0;
            const totalConclusions = data.completes + data.fails;

            // Derived metrics (matching exact formulas from LevelFunnelService)
            const winRate = totalConclusions > 0 ? (data.completes / totalConclusions) * 100 : 0;
            const completionRate = startedPlayers > 0 ? (completedPlayers / startedPlayers) * 100 : 0;
            const failRate = totalConclusions > 0 ? (data.fails / totalConclusions) * 100 : 0;
            const funnelRate = firstLevelStartedUsers > 0 ? (completedPlayers / firstLevelStartedUsers) * 100 : 0;

            // APS calculation
            const aps = data.completes > 0 ? data.starts / data.completes : 0;

            // Duration averages
            const meanCompletionDuration = data.completionCount > 0
                ? Number(data.totalCompletionDuration) / data.completionCount
                : 0;
            const meanFailDuration = data.failCount > 0
                ? Number(data.totalFailDuration) / data.failCount
                : 0;

            // Booster and EGP rates
            // Defensive: Use 0 if counts are undefined (old aggregated data)
            const boosterUsers = data.boosterUsers || 0;
            const egpUsers = data.egpUsers || 0;
            const boosterUsage = startedPlayers > 0 ? (boosterUsers / startedPlayers) * 100 : 0;
            const egpRate = startedPlayers > 0 ? (egpUsers / startedPlayers) * 100 : 0;

            // Churn calculations
            const churnStartComplete = startedPlayers > 0
                ? ((startedPlayers - completedPlayers) / startedPlayers) * 100
                : 0;

            let churnCompleteNext = 0;
            if (nextLevelData) {
                const nextLevelStarters = nextLevelData.startedPlayers || 0;
                churnCompleteNext = completedPlayers > 0
                    ? ((completedPlayers - nextLevelStarters) / completedPlayers) * 100
                    : 0;
            }

            const churnTotal = startedPlayers > 0
                ? ((startedPlayers - completedPlayers + (nextLevelData ? completedPlayers - (nextLevelData.startedPlayers || 0) : 0)) / startedPlayers) * 100
                : 0;

            levelMetrics.push({
                levelId,
                startedPlayers,
                completedPlayers,
                starts: data.starts,
                completes: data.completes,
                fails: data.fails,
                winRate: Math.round(winRate * 100) / 100,
                completionRate: Math.round(completionRate * 100) / 100,
                failRate: Math.round(failRate * 100) / 100,
                funnelRate: Math.round(funnelRate * 100) / 100,
                churnTotal: Math.round(churnTotal * 100) / 100,
                churnStartComplete: Math.round(churnStartComplete * 100) / 100,
                churnCompleteNext: Math.round(churnCompleteNext * 100) / 100,
                aps: Math.round(aps * 100) / 100,
                apsRaw: Math.round(aps * 100) / 100, // Backward compatibility: same as aps
                apsClean: 0, // Backward compatibility: deprecated field
                meanCompletionDuration: Math.round(meanCompletionDuration * 100) / 100,
                meanFailDuration: Math.round(meanFailDuration * 100) / 100,
                cumulativeAvgTime: 0,
                boosterUsage: Math.round(boosterUsage * 100) / 100,
                egpRate: Math.round(egpRate * 100) / 100,
                customMetrics: {}
            });
        }

        // Calculate cumulative average time
        let cumulativeTime = 0;
        for (const metric of levelMetrics) {
            cumulativeTime += metric.meanCompletionDuration;
            metric.cumulativeAvgTime = Math.round(cumulativeTime * 100) / 100;
        }

        return levelMetrics;
    }

    /**
     * Get level funnel data with all metrics (LEGACY VERSION using raw events)
     * Kept for validation and debugging
     */
    async getLevelFunnelData(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        logger.warn('Legacy level funnel raw query disabled. Falling back to aggregated fast path.');
        return this.getLevelFunnelDataFast(filters);
    }

    /**
     * Legacy raw implementation removed (disabled to avoid raw scans).
     * Kept below as reference in git history.
     */
    /*
    async getLevelFunnelData(filters: LevelFunnelFilters): Promise<LevelMetrics[]> {
        try {
            const { gameId, startDate, endDate, country, platform, version, abTestId, variantId, levelFunnel, levelFunnelVersion, levelLimit = 100 } = filters;

            // ...existing code...
            // Build where clause for filtering
            const whereClause: any = {
                gameId,
                eventName: {
                    in: ['level_start', 'level_complete', 'level_failed']
                }
            };

            if (startDate) {
                whereClause.timestamp = { ...whereClause.timestamp, gte: startDate };
            }
            if (endDate) {
                whereClause.timestamp = { ...whereClause.timestamp, lte: endDate };
            }
            if (country) {
                // Support multiple countries (comma-separated)
                const countries = country.split(',').map(c => c.trim()).filter(c => c);
                if (countries.length > 1) {
                    whereClause.countryCode = { in: countries };
                } else if (countries.length === 1) {
                    whereClause.countryCode = countries[0];
                }
            }
            if (platform) {
                // Support multiple platforms (comma-separated)
                const platforms = platform.split(',').map(p => p.trim()).filter(p => p);
                if (platforms.length > 1) {
                    whereClause.platform = { in: platforms };
                } else if (platforms.length === 1) {
                    whereClause.platform = platforms[0];
                }
            }
            if (version) {
                // Support multiple versions (comma-separated)
                const versions = version.split(',').map(v => v.trim()).filter(v => v);
                if (versions.length > 1) {
                    whereClause.appVersion = { in: versions };
                } else if (versions.length === 1) {
                    whereClause.appVersion = versions[0];
                }
            }

            // Filter by level funnel combinations (exact funnel + version pairs)
            if (levelFunnel && levelFunnelVersion) {
                const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
                const versions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                
                // Build OR conditions for exact funnel+version pairs
                if (funnels.length > 0 && versions.length > 0 && funnels.length === versions.length) {
                    if (funnels.length === 1) {
                        // Single funnel pair - direct assignment
                        whereClause.levelFunnel = funnels[0];
                        whereClause.levelFunnelVersion = versions[0];
                    } else {
                        // Multiple funnel pairs - use OR condition for exact pairs
                        whereClause.OR = funnels.map((funnel, idx) => ({
                            levelFunnel: funnel,
                            levelFunnelVersion: versions[idx]
                        }));
                    }
                }
            } else if (levelFunnel) {
                // Only funnel specified, no version
                const funnels = levelFunnel.split(',').map(f => f.trim()).filter(f => f);
                if (funnels.length > 1) {
                    whereClause.levelFunnel = { in: funnels };
                } else if (funnels.length === 1) {
                    whereClause.levelFunnel = funnels[0];
                }
            } else if (levelFunnelVersion) {
                // Only version specified, no funnel
                const versions = levelFunnelVersion.toString().split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                if (versions.length > 1) {
                    whereClause.levelFunnelVersion = { in: versions };
                } else if (versions.length === 1) {
                    whereClause.levelFunnelVersion = versions[0];
                }
            }

            // NEW APPROACH: Filter by AB test data embedded in event
            // Much faster than querying TestAssignment and doing IN clause
            if (abTestId && variantId) {
                // PostgreSQL: Use JSON operator to filter
                // SQLite: Will need to filter in memory (for dev only)
                whereClause.abTests = {
                    path: [abTestId],
                    equals: variantId
                };
            }

            // Performance optimization: Log query start
            const queryStart = Date.now();
            logger.info(`Starting level funnel query for game ${gameId} with filters:`, {
                startDate: startDate?.toISOString(),
                endDate: endDate?.toISOString(),
                country,
                platform,
                version,
                levelFunnel,
                levelFunnelVersion,
                levelLimit
            });

            // Get all level events
            let events = await prisma.event.findMany({
                where: whereClause,
                select: {
                    id: true,
                    userId: true,
                    eventName: true,
                    properties: true,
                    timestamp: true,
                    levelFunnel: true,
                    levelFunnelVersion: true
                },
                orderBy: {
                    timestamp: 'asc'
                }
            });

            const queryDuration = Date.now() - queryStart;
            logger.info(`Level funnel query completed in ${queryDuration}ms, fetched ${events.length} events`);

            // Group events by level
            const levelGroups = this.groupEventsByLevel(events);

            // Calculate metrics for each level
            const levelMetrics: LevelMetrics[] = [];
            // Sort level IDs and filter out any undefined values
            const levelIds = Array.from(levelGroups.keys())
                .filter((id): id is number => id !== undefined && id !== null)
                .sort((a, b) => a - b);

            // Get first level started users count for funnel rate calculation
            let firstLevelStartedUsers = 0;
            if (levelIds.length > 0) {
                const firstLevelId = levelIds[0];
                if (firstLevelId !== undefined) {
                    const firstLevelEvents = levelGroups.get(firstLevelId);
                    if (firstLevelEvents) {
                        const firstLevelStarts = firstLevelEvents.filter(e => e.eventName === 'level_start');
                        firstLevelStartedUsers = new Set(firstLevelStarts.map(e => e.userId)).size;
                    }
                }
            }

            // Apply level limit (default 100)
            const limitedLevelIds = levelIds.slice(0, levelLimit);
            logger.info(`Processing ${limitedLevelIds.length} levels out of ${levelIds.length} total (limit: ${levelLimit})`);

            const metricsStart = Date.now();
            for (let i = 0; i < limitedLevelIds.length; i++) {
                const levelId = limitedLevelIds[i]!; // Non-null assertion since we filtered
                const nextLevelId: number | null = i < limitedLevelIds.length - 1 ? limitedLevelIds[i + 1]! : null;
                
                const metrics = await this.calculateLevelMetrics(
                    levelId,
                    levelGroups.get(levelId)!,
                    nextLevelId !== null ? levelGroups.get(nextLevelId) : undefined,
                    firstLevelStartedUsers
                );
                
                levelMetrics.push(metrics);
            }
            const metricsDuration = Date.now() - metricsStart;
            logger.info(`Metrics calculation completed in ${metricsDuration}ms for ${limitedLevelIds.length} levels`);

            // Calculate cumulative average time for each level
            let cumulativeTime = 0;
            for (let i = 0; i < levelMetrics.length; i++) {
                const metric = levelMetrics[i];
                if (metric) {
                    cumulativeTime += metric.meanCompletionDuration;
                    metric.cumulativeAvgTime = Math.round(cumulativeTime * 100) / 100;
                }
            }

            const totalDuration = Date.now() - queryStart;
            logger.info(`Total level funnel processing completed in ${totalDuration}ms`);

            return levelMetrics;
        } catch (error) {
            logger.error('Error in getLevelFunnelData:', error);
            throw error;
        }
    }
    */

    /**
     * Group events by levelId
     */
    private groupEventsByLevel(events: any[]): Map<number, any[]> {
        const groups = new Map<number, any[]>();

        for (const event of events) {
            const props = event.properties as any;
            const levelId = props?.levelId;

            if (levelId !== undefined && levelId !== null && typeof levelId === 'number') {
                if (!groups.has(levelId)) {
                    groups.set(levelId, []);
                }
                groups.get(levelId)!.push(event);
            }
        }

        return groups;
    }

    /**
     * Calculate all metrics for a specific level
     */
    private async calculateLevelMetrics(
        levelId: number,
        events: any[],
        nextLevelEvents?: any[],
        firstLevelStartedUsers?: number
    ): Promise<LevelMetrics> {
        // Separate events by type
        const startEvents = events.filter(e => e.eventName === 'level_start');
        const completeEvents = events.filter(e => e.eventName === 'level_complete');
        const failEvents = events.filter(e => e.eventName === 'level_failed');

        // Basic counts
        const uniquePlayers = new Set(events.map(e => e.userId)).size;
        const totalStarts = startEvents.length;
        const totalCompletes = completeEvents.length;
        const totalFails = failEvents.length;

        // Get unique users for each event type
        const usersWhoStarted = new Set(startEvents.map(e => e.userId));
        const usersWhoCompleted = new Set(completeEvents.map(e => e.userId));
        const usersWhoFailed = new Set(failEvents.map(e => e.userId));

        // Started Players: unique users who triggered level_start
        const startedPlayers = usersWhoStarted.size;
        
        // Completed Players: unique users who triggered level_complete
        const completedPlayers = usersWhoCompleted.size;

        // Win Rate: (Completed levels / (Completed + Failed levels)) × 100
        // This excludes users who only started but never completed or failed
        const totalConclusions = totalCompletes + totalFails;
        const winRate = totalConclusions > 0 ? (totalCompletes / totalConclusions) * 100 : 0;

        // Completion Rate: (unique players completed / unique players started) × 100
        const completionRate = startedPlayers > 0 ? (completedPlayers / startedPlayers) * 100 : 0;

        // Fail Rate: (Fail events / (Completed + Failed levels)) × 100
        // This also excludes users who only started
        const failRate = totalConclusions > 0 ? (totalFails / totalConclusions) * 100 : 0;

        // Funnel Rate: (Nth level completed users / 1st level started users) × 100
        const funnelRate = firstLevelStartedUsers && firstLevelStartedUsers > 0
            ? (completedPlayers / firstLevelStartedUsers) * 100
            : 0;

        // Churn (Start-Complete): % of users who started but never completed
        const churnStartComplete = usersWhoStarted.size > 0
            ? ((usersWhoStarted.size - usersWhoCompleted.size) / usersWhoStarted.size) * 100
            : 0;

        // Churn (Complete-Next): % of users who completed this level but didn't start next
        let churnCompleteNext = 0;
        let nextLevelStarters = new Set<string>();
        if (nextLevelEvents) {
            nextLevelStarters = new Set(
                nextLevelEvents
                    .filter(e => e.eventName === 'level_start')
                    .map(e => e.userId)
            );
            
            churnCompleteNext = usersWhoCompleted.size > 0
                ? ((usersWhoCompleted.size - nextLevelStarters.size) / usersWhoCompleted.size) * 100
                : 0;
        }

        // Churn Total: Total users lost (didn't complete + completed but didn't continue) as % of started users
        // This is: (users who never completed + users who completed but didn't start next) / started users
        const usersWhoDidntComplete = usersWhoStarted.size - usersWhoCompleted.size;
        const usersWhoCompletedButDidntContinue = nextLevelEvents 
            ? usersWhoCompleted.size - nextLevelStarters.size
            : 0;
        const churnTotal = usersWhoStarted.size > 0
            ? ((usersWhoDidntComplete + usersWhoCompletedButDidntContinue) / usersWhoStarted.size) * 100
            : 0;

        // APS (Attempts Per Success): starts per complete event
        const aps = totalCompletes > 0
            ? totalStarts / totalCompletes
            : 0;

        // Mean Completion Duration
        const completionDurations = this.calculateDurations(startEvents, completeEvents);
        const meanCompletionDuration = completionDurations.length > 0
            ? completionDurations.reduce((sum, d) => sum + d, 0) / completionDurations.length
            : 0;

        // Mean Fail Duration
        const failDurations = this.calculateDurations(startEvents, failEvents);
        const meanFailDuration = failDurations.length > 0
            ? failDurations.reduce((sum, d) => sum + d, 0) / failDurations.length
            : 0;

        // Booster Usage: % of users who used boosters
        const usersWithBoosters = new Set(
            [...completeEvents, ...failEvents]
                .filter(e => {
                    const props = e.properties as any;
                    return props?.boosters && (
                        typeof props.boosters === 'number' ? props.boosters > 0 :
                        typeof props.boosters === 'object' ? Object.keys(props.boosters).length > 0 :
                        false
                    );
                })
                .map(e => e.userId)
        );
        const boosterUsage = uniquePlayers > 0
            ? (usersWithBoosters.size / uniquePlayers) * 100
            : 0;

        // EGP (End Game Purchase) Rate: % of users who made revive purchase
        // Check both level_complete (if user failed then revived and completed) and level_failed events
        // EGP is now an integer representing the number of purchases
        const usersWithEGP = new Set(
            [...completeEvents, ...failEvents]
                .filter(e => {
                    const props = e.properties as any;
                    // Check if egp exists and is > 0 (integer) or true (backwards compatibility)
                    const egpValue = props?.egp ?? props?.endGamePurchase;
                    return (typeof egpValue === 'number' && egpValue > 0) || egpValue === true;
                })
                .map(e => e.userId)
        );
        // Calculate rate based on all players who reached completion/fail (not just failed)
        // This is because users can fail -> revive with EGP -> complete
        const egpRate = uniquePlayers > 0
            ? (usersWithEGP.size / uniquePlayers) * 100
            : 0;

        // Custom Metrics - aggregate from event properties
        const customMetrics = this.extractCustomMetrics([...completeEvents, ...failEvents]);

        // Get level name from first event
        const levelName = (events[0]?.properties as any)?.levelName;

        return {
            levelId,
            levelName,
            startedPlayers,
            completedPlayers,
            starts: totalStarts,
            completes: totalCompletes,
            fails: totalFails,
            winRate: Math.round(winRate * 100) / 100, // Round to 2 decimals
            completionRate: Math.round(completionRate * 100) / 100, // Round to 2 decimals
            failRate: Math.round(failRate * 100) / 100,
            funnelRate: Math.round(funnelRate * 100) / 100, // Round to 2 decimals
            churnTotal: Math.round(churnTotal * 100) / 100,
            churnStartComplete: Math.round(churnStartComplete * 100) / 100,
            churnCompleteNext: Math.round(churnCompleteNext * 100) / 100,
            aps: Math.round(aps * 100) / 100,
            apsRaw: Math.round(aps * 100) / 100, // Backward compatibility: same as aps
            apsClean: 0, // Backward compatibility: deprecated field
            meanCompletionDuration: Math.round(meanCompletionDuration * 100) / 100,
            meanFailDuration: Math.round(meanFailDuration * 100) / 100,
            cumulativeAvgTime: 0, // Will be calculated after all levels are processed
            boosterUsage: Math.round(boosterUsage * 100) / 100,
            egpRate: Math.round(egpRate * 100) / 100,
            customMetrics
        };
    }


    /**
     * Calculate durations between start and end events for the same user
     * Uses IQR (Interquartile Range) method to filter outliers
     */
    private calculateDurations(startEvents: any[], endEvents: any[]): number[] {
        const rawDurations: number[] = [];
        
        // Create a map of user's start events
        const userStarts = new Map<string, any[]>();
        for (const event of startEvents) {
            if (!userStarts.has(event.userId)) {
                userStarts.set(event.userId, []);
            }
            userStarts.get(event.userId)!.push(event);
        }

        // For each end event, find the closest previous start event
        for (const endEvent of endEvents) {
            const starts = userStarts.get(endEvent.userId);
            if (starts) {
                // Find the most recent start before this end
                const validStarts = starts.filter(s => s.timestamp <= endEvent.timestamp);
                if (validStarts.length > 0) {
                    const closestStart = validStarts[validStarts.length - 1];
                    const duration = (endEvent.timestamp.getTime() - closestStart.timestamp.getTime()) / 1000;
                    if (duration > 0) {
                        rawDurations.push(duration);
                    }
                }
            }
        }

        // Filter outliers using IQR method
        return this.filterOutliers(rawDurations);
    }

    /**
     * Filter outliers using IQR (Interquartile Range) method
     * Removes values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR
     */
    private filterOutliers(values: number[]): number[] {
        if (values.length < 4) {
            return values; // Not enough data for IQR
        }

        // Sort values
        const sorted = [...values].sort((a, b) => a - b);
        
        // Calculate Q1 (25th percentile) and Q3 (75th percentile)
        const q1Index = Math.floor(sorted.length * 0.25);
        const q3Index = Math.floor(sorted.length * 0.75);
        const q1 = sorted[q1Index];
        const q3 = sorted[q3Index];
        
        // Ensure q1 and q3 are defined
        if (q1 === undefined || q3 === undefined) {
            return values;
        }
        
        // Calculate IQR
        const iqr = q3 - q1;
        
        // Define bounds
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        // Filter outliers
        const filtered = values.filter(v => v >= lowerBound && v <= upperBound);
        
        // Log outlier removal for monitoring
        const outliersRemoved = values.length - filtered.length;
        if (outliersRemoved > 0) {
            logger.debug(`Filtered ${outliersRemoved} outliers (${((outliersRemoved / values.length) * 100).toFixed(1)}%) using IQR method. Bounds: [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);
        }
        
        return filtered;
    }

    /**
     * Extract custom metrics from event properties
     */
    private extractCustomMetrics(events: any[]): Record<string, any> {
        const customMetrics: Record<string, any> = {};
        const knownFields = new Set([
            'levelId', 'levelName', 'score', 'timeSeconds', 'stars',
            'reason', 'attempts', 'boosters', 'egp', 'endGamePurchase'
        ]);

        // Collect all custom fields
        const customFields = new Map<string, number[]>();
        
        for (const event of events) {
            const props = event.properties as any;
            if (props) {
                for (const [key, value] of Object.entries(props)) {
                    if (!knownFields.has(key) && typeof value === 'number') {
                        if (!customFields.has(key)) {
                            customFields.set(key, []);
                        }
                        customFields.get(key)!.push(value);
                    }
                }
            }
        }

        // Calculate averages for custom fields
        for (const [key, values] of customFields.entries()) {
            if (values.length > 0) {
                const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
                customMetrics[key] = Math.round(avg * 100) / 100;
            }
        }

        return customMetrics;
    }

    /**
     * Get level funnel data with AB test breakdown
     */
    async getLevelFunnelWithCohorts(filters: LevelFunnelFilters): Promise<any> {
        try {
            if (!filters.abTestId) {
                // No AB test specified, return regular funnel
                return { default: await this.getLevelFunnelData(filters) };
            }

            // Get AB test variants
            const abTest = await prisma.aBTest.findUnique({
                where: { id: filters.abTestId },
                include: {
                    variants: true
                }
            });

            if (!abTest) {
                throw new Error('AB test not found');
            }

            // Get funnel data for each variant
            const cohortData: Record<string, LevelMetrics[]> = {};

            for (const variant of abTest.variants) {
                // Get users in this variant
                const variantUsers = await prisma.user.findMany({
                    where: {
                        gameId: filters.gameId,
                        // TODO: Add variant assignment logic
                    },
                    select: { id: true }
                });

                // Filter events by variant users
                // This is a simplified version - you may need to adjust based on your variant assignment logic
                cohortData[variant.name] = await this.getLevelFunnelData(filters);
            }

            return cohortData;
        } catch (error) {
            logger.error('Error in getLevelFunnelWithCohorts:', error);
            throw error;
        }
    }

    /**
     * Get available custom metrics for a game
     */
    async getAvailableCustomMetrics(gameId: string): Promise<string[]> {
        try {
            // Get a sample of level events to discover custom properties
            const sampleEvents = await prisma.event.findMany({
                where: {
                    gameId,
                    eventName: {
                        in: ['level_complete', 'level_failed']
                    }
                },
                take: 100,
                select: {
                    properties: true
                }
            });

            const knownFields = new Set([
                'levelId', 'levelName', 'score', 'timeSeconds', 'stars',
                'reason', 'attempts', 'boosters', 'egp', 'endGamePurchase'
            ]);

            const customFieldsSet = new Set<string>();

            for (const event of sampleEvents) {
                const props = event.properties as any;
                if (props) {
                    for (const key of Object.keys(props)) {
                        if (!knownFields.has(key)) {
                            customFieldsSet.add(key);
                        }
                    }
                }
            }

            return Array.from(customFieldsSet);
        } catch (error) {
            logger.error('Error in getAvailableCustomMetrics:', error);
            return [];
        }
    }
}

export default new LevelFunnelService();
