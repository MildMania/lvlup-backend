import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import prisma from '../prisma';
import clickHouseService from '../services/ClickHouseService';
import logger from '../utils/logger';

/**
 * Controller for analytics filter options
 */
export class AnalyticsFiltersController {
    private readFromClickHouse(): boolean {
        return (
            process.env.ANALYTICS_READ_FILTER_OPTIONS_FROM_CLICKHOUSE === '1' ||
            process.env.ANALYTICS_READ_FILTER_OPTIONS_FROM_CLICKHOUSE === 'true'
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
     * Get available filter options (countries, versions, platforms)
     */
    async getFilterOptions(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            let countries: Array<{ countryCode: string }>;
            let versions: Array<{ appVersion: string }>;
            let platforms: Array<{ platform: string }>;
            let levelFunnels: Array<{ levelFunnel: string; levelFunnelVersion: number }>;

            const useClickHouse = this.readFromClickHouse();
            if (useClickHouse && this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
                throw new Error('ClickHouse strict mode enabled for filters options, but ClickHouse is not configured/enabled in API env');
            }
            if (useClickHouse && clickHouseService.isEnabled()) {
                try {
                    const qGameId = this.quoteClickHouseString(gameId);
                    [countries, versions, platforms, levelFunnels] = await Promise.all([
                        clickHouseService.query<Array<{ countryCode: string }>[number]>(`
                            SELECT countryCode
                            FROM (
                                SELECT
                                    countryCode,
                                    sum(dau) AS userCount
                                FROM active_users_daily_raw
                                WHERE gameId = ${qGameId}
                                  AND countryCode != ''
                                GROUP BY countryCode
                                ORDER BY userCount DESC, countryCode ASC
                            )
                        `),
                        clickHouseService.query<Array<{ appVersion: string }>[number]>(`
                            SELECT DISTINCT appVersion
                            FROM active_users_daily_raw
                            WHERE gameId = ${qGameId}
                              AND appVersion != ''
                            ORDER BY appVersion ASC
                        `),
                        clickHouseService.query<Array<{ platform: string }>[number]>(`
                            SELECT DISTINCT platform
                            FROM active_users_daily_raw
                            WHERE gameId = ${qGameId}
                              AND platform != ''
                            ORDER BY platform ASC
                        `),
                        clickHouseService.query<Array<{ levelFunnel: string; levelFunnelVersion: number }>[number]>(`
                            SELECT DISTINCT levelFunnel, levelFunnelVersion
                            FROM level_metrics_daily_raw
                            WHERE gameId = ${qGameId}
                              AND levelFunnel != ''
                            ORDER BY levelFunnel ASC, levelFunnelVersion ASC
                        `)
                    ]);
                } catch (clickHouseError) {
                    if (this.isClickHouseStrict()) throw clickHouseError;
                    logger.warn('[AnalyticsFilters] ClickHouse read failed; falling back to Postgres', {
                        gameId,
                        error: clickHouseError instanceof Error ? clickHouseError.message : String(clickHouseError),
                    });
                    [countries, versions, platforms, levelFunnels] = await Promise.all([
                        prisma.$queryRaw<Array<{ countryCode: string; userCount: bigint }>>`
                            SELECT
                                "countryCode",
                                COALESCE(SUM("dau"), 0) AS "userCount"
                            FROM "active_users_daily"
                            WHERE "gameId" = ${gameId}
                              AND "countryCode" <> ''
                            GROUP BY "countryCode"
                            ORDER BY "userCount" DESC, "countryCode" ASC
                        `,
                        prisma.$queryRaw<Array<{ appVersion: string }>>`
                            SELECT DISTINCT "appVersion"
                            FROM "active_users_daily"
                            WHERE "gameId" = ${gameId}
                              AND "appVersion" <> ''
                            ORDER BY "appVersion" ASC
                        `,
                        prisma.$queryRaw<Array<{ platform: string }>>`
                            SELECT DISTINCT "platform"
                            FROM "active_users_daily"
                            WHERE "gameId" = ${gameId}
                              AND "platform" <> ''
                            ORDER BY "platform" ASC
                        `,
                        prisma.$queryRaw<Array<{ levelFunnel: string; levelFunnelVersion: number }>>`
                            SELECT DISTINCT "levelFunnel", "levelFunnelVersion"
                            FROM "level_metrics_daily"
                            WHERE "gameId" = ${gameId}
                              AND "levelFunnel" <> ''
                            ORDER BY "levelFunnel" ASC, "levelFunnelVersion" ASC
                        `
                    ]);
                }
            } else {
                [countries, versions, platforms, levelFunnels] = await Promise.all([
                    prisma.$queryRaw<Array<{ countryCode: string; userCount: bigint }>>`
                        SELECT
                            "countryCode",
                            COALESCE(SUM("dau"), 0) AS "userCount"
                        FROM "active_users_daily"
                        WHERE "gameId" = ${gameId}
                          AND "countryCode" <> ''
                        GROUP BY "countryCode"
                        ORDER BY "userCount" DESC, "countryCode" ASC
                    `,
                    prisma.$queryRaw<Array<{ appVersion: string }>>`
                        SELECT DISTINCT "appVersion"
                        FROM "active_users_daily"
                        WHERE "gameId" = ${gameId}
                          AND "appVersion" <> ''
                        ORDER BY "appVersion" ASC
                    `,
                    prisma.$queryRaw<Array<{ platform: string }>>`
                        SELECT DISTINCT "platform"
                        FROM "active_users_daily"
                        WHERE "gameId" = ${gameId}
                          AND "platform" <> ''
                        ORDER BY "platform" ASC
                    `,
                    prisma.$queryRaw<Array<{ levelFunnel: string; levelFunnelVersion: number }>>`
                        SELECT DISTINCT "levelFunnel", "levelFunnelVersion"
                        FROM "level_metrics_daily"
                        WHERE "gameId" = ${gameId}
                          AND "levelFunnel" <> ''
                        ORDER BY "levelFunnel" ASC, "levelFunnelVersion" ASC
                    `
                ]);
            }

            // Process level funnel options
            const levelFunnelOptions = levelFunnels
                .filter(e => e.levelFunnel)
                .map(e => ({
                    funnel: e.levelFunnel!,
                    version: e.levelFunnelVersion || 1,
                    label: `${e.levelFunnel} (${e.levelFunnelVersion || 1})`
                }))
                .sort((a, b) => {
                    if (a.funnel !== b.funnel) {
                        return a.funnel.localeCompare(b.funnel);
                    }
                    return a.version - b.version;
                });

            res.status(200).json({
                success: true,
                data: {
                    countries: countries.map(c => c.countryCode).filter(Boolean),
                    versions: versions.map(v => v.appVersion).filter(Boolean),
                    platforms: platforms.map(p => p.platform).filter(Boolean),
                    levelFunnels: levelFunnelOptions
                }
            });
        } catch (error) {
            console.error('Error getting filter options:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve filter options'
            });
        }
    }
}
