import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../types/api';

const prisma = new PrismaClient();

/**
 * Controller for analytics filter options
 */
export class AnalyticsFiltersController {
    /**
     * Get available filter options (countries, versions, platforms)
     */
    async getFilterOptions(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;

            // Get distinct values for each filter from events
            const [countries, versions, platforms, levelFunnels] = await Promise.all([
                // Get distinct countries from events
                prisma.event.findMany({
                    where: {
                        gameId,
                        countryCode: { not: null }
                    },
                    select: { countryCode: true },
                    distinct: ['countryCode'],
                    orderBy: { countryCode: 'asc' }
                }),

                // Get distinct versions from events
                prisma.event.findMany({
                    where: {
                        gameId,
                        appVersion: { not: null }
                    },
                    select: { appVersion: true },
                    distinct: ['appVersion'],
                    orderBy: { appVersion: 'asc' }
                }),

                // Get distinct platforms from events
                prisma.event.findMany({
                    where: {
                        gameId,
                        platform: { not: null }
                    },
                    select: { platform: true },
                    distinct: ['platform'],
                    orderBy: { platform: 'asc' }
                }),

                // Get distinct level funnel combinations
                prisma.event.findMany({
                    where: {
                        gameId,
                        levelFunnel: { not: null },
                        eventName: {
                            in: ['level_start', 'level_complete', 'level_failed']
                        }
                    },
                    select: {
                        levelFunnel: true,
                        levelFunnelVersion: true
                    },
                    distinct: ['levelFunnel', 'levelFunnelVersion']
                })
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
