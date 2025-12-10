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

            // Get distinct values for each filter
            const [countries, versions, platforms] = await Promise.all([
                // Get distinct countries
                prisma.user.findMany({
                    where: {
                        gameId,
                        country: { not: null }
                    },
                    select: { country: true },
                    distinct: ['country'],
                    orderBy: { country: 'asc' }
                }),

                // Get distinct versions
                prisma.user.findMany({
                    where: {
                        gameId,
                        version: { not: null }
                    },
                    select: { version: true },
                    distinct: ['version'],
                    orderBy: { version: 'asc' }
                }),

                // Get distinct platforms
                prisma.user.findMany({
                    where: {
                        gameId,
                        platform: { not: null }
                    },
                    select: { platform: true },
                    distinct: ['platform'],
                    orderBy: { platform: 'asc' }
                })
            ]);

            res.status(200).json({
                success: true,
                data: {
                    countries: countries.map(c => c.country).filter(Boolean),
                    versions: versions.map(v => v.version).filter(Boolean),
                    platforms: platforms.map(p => p.platform).filter(Boolean)
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
