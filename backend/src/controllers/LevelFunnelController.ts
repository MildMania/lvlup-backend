import { Request, Response } from 'express';
import levelFunnelService from '../services/LevelFunnelService';
import { ApiResponse } from '../types/api';
import logger from '../utils/logger';

export class LevelFunnelController {
    /**
     * Get level funnel data
     * GET /api/analytics/level-funnel
     */
    async getLevelFunnel(req: Request, res: Response<ApiResponse>) {
        try {
            const {
                gameId,
                startDate,
                endDate,
                country,
                platform,
                version,
                abTestId,
                levelFunnel,
                levelFunnelVersion,
                levelLimit
            } = req.query;

            if (!gameId) {
                return res.status(400).json({
                    success: false,
                    error: 'gameId is required'
                });
            }

            // Process dates using standard format (matches retention calculation pattern)
            const processedStartDate = startDate ? new Date(startDate as string + 'T00:00:00.000Z') : undefined;
            const processedEndDate = endDate ? new Date(endDate as string + 'T23:59:59.999Z') : undefined;

            const filters = {
                gameId: gameId as string,
                startDate: processedStartDate,
                endDate: processedEndDate,
                country: country as string | undefined,
                platform: platform as string | undefined,
                version: version as string | undefined,
                abTestId: abTestId as string | undefined,
                levelFunnel: levelFunnel as string | undefined,
                levelFunnelVersion: levelFunnelVersion ? parseInt(levelFunnelVersion as string) : undefined,
                levelLimit: levelLimit ? parseInt(levelLimit as string) : 100 // Default to 100
            };

            // Check if AB test breakdown is requested
            if (abTestId) {
                const cohortData = await levelFunnelService.getLevelFunnelWithCohorts(filters);
                return res.json({
                    success: true,
                    data: {
                        cohorts: cohortData,
                        filters: {
                            gameId: filters.gameId,
                            dateRange: {
                                start: filters.startDate?.toISOString(),
                                end: filters.endDate?.toISOString()
                            },
                            country: filters.country,
                            version: filters.version,
                            abTestId: filters.abTestId
                        }
                    }
                });
            }

            const levels = await levelFunnelService.getLevelFunnelData(filters);

            res.json({
                success: true,
                data: {
                    levels,
                    filters: {
                        gameId: filters.gameId,
                        dateRange: {
                            start: filters.startDate?.toISOString(),
                            end: filters.endDate?.toISOString()
                        },
                        country: filters.country,
                        platform: filters.platform,
                        version: filters.version
                    },
                    totalPlayers: levels[0]?.startedPlayers || 0,
                    totalLevels: levels.length
                }
            });
        } catch (error) {
            logger.error('Error in getLevelFunnel:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve level funnel data'
            });
        }
    }

    /**
     * Get specific level details
     * GET /api/analytics/level-funnel/:levelId
     */
    async getLevelDetails(req: Request, res: Response<ApiResponse>) {
        try {
            const { levelId } = req.params;
            const {
                gameId,
                startDate,
                endDate,
                country,
                platform,
                version
            } = req.query;

            if (!gameId) {
                return res.status(400).json({
                    success: false,
                    error: 'gameId is required'
                });
            }

            // Process dates using standard format (matches retention calculation pattern)
            const processedStartDate = startDate ? new Date(startDate as string + 'T00:00:00.000Z') : undefined;
            const processedEndDate = endDate ? new Date(endDate as string + 'T23:59:59.999Z') : undefined;

            const filters = {
                gameId: gameId as string,
                startDate: processedStartDate,
                endDate: processedEndDate,
                country: country as string | undefined,
                platform: platform as string | undefined,
                version: version as string | undefined
            };

            const allLevels = await levelFunnelService.getLevelFunnelData(filters);
            const levelIdNum = parseInt(levelId || '0');
            const levelData = allLevels.find(l => l.levelId === levelIdNum);

            if (!levelData) {
                return res.status(404).json({
                    success: false,
                    error: 'Level not found'
                });
            }

            res.json({
                success: true,
                data: levelData
            });
        } catch (error) {
            logger.error('Error in getLevelDetails:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve level details'
            });
        }
    }

    /**
     * Get available custom metrics for a game
     * GET /api/analytics/level-funnel/custom-metrics
     */
    async getCustomMetrics(req: Request, res: Response<ApiResponse>) {
        try {
            const { gameId } = req.query;

            if (!gameId) {
                return res.status(400).json({
                    success: false,
                    error: 'gameId is required'
                });
            }

            const customMetrics = await levelFunnelService.getAvailableCustomMetrics(gameId as string);

            res.json({
                success: true,
                data: {
                    customMetrics
                }
            });
        } catch (error) {
            logger.error('Error in getCustomMetrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve custom metrics'
            });
        }
    }
}
export default new LevelFunnelController();

