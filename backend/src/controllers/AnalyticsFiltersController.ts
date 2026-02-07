import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import prisma from '../prisma';

/**
 * Controller for analytics filter options
 */
export class AnalyticsFiltersController {
    /**
     * Get available filter options (countries, versions, platforms)
     */
    async getFilterOptions(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Use rollup tables instead of raw events for filter options
            const [countries, versions, platforms, levelFunnels] = await Promise.all([
                prisma.$queryRaw<Array<{ countryCode: string }>>`
                    SELECT DISTINCT "countryCode"
                    FROM "active_users_daily"
                    WHERE "gameId" = ${gameId}
                      AND "countryCode" <> ''
                    ORDER BY "countryCode" ASC
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
