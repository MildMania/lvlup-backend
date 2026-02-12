import { Request, Response } from 'express';
import { PlayerJourneyService } from '../services/PlayerJourneyService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import logger from '../utils/logger';
import { logAnalyticsMetrics } from '../utils/analyticsDebug';

const playerJourneyService = new PlayerJourneyService();

export class PlayerJourneyController {
    private logMemory(label: string) {
        const mem = process.memoryUsage();
        logAnalyticsMetrics(`[AnalyticsMetrics] ${label}`, {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external
        });
    }
    /**
     * Create a new checkpoint definition
     */
    async createCheckpoint(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract checkpoint data from request body
            const checkpointData = {
                name: req.body.name,
                description: req.body.description,
                type: req.body.type,
                tags: req.body.tags,
                order: req.body.order
            };

            const data = await playerJourneyService.createCheckpoint(gameId, checkpointData);

            res.status(201).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in createCheckpoint controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create checkpoint'
            });
        }
    }

    /**
     * Get all checkpoints for a game
     */
    async getCheckpoints(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Implement get checkpoints functionality
            // This would be added to the PlayerJourneyService

            res.status(200).json({
                success: true,
                data: [] // Placeholder
            });
        } catch (error) {
            logger.error('Error in getCheckpoints controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get checkpoints'
            });
        }
    }

    /**
     * Record a player reaching a checkpoint
     */
    async recordCheckpoint(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract player checkpoint data from request body
            const playerCheckpointData = {
                userId: req.body.userId,
                checkpointId: req.body.checkpointId,
                timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
                metadata: req.body.metadata
            };

            const data = await playerJourneyService.recordPlayerCheckpoint(gameId, playerCheckpointData);

            res.status(201).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in recordCheckpoint controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to record checkpoint'
            });
        }
    }

    /**
     * Get journey progress analytics
     */
    async getJourneyProgress(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const startTime = Date.now();
            this.logMemory('journey progress start');

            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[],
                checkpointType: req.query.checkpointType as string | string[],
                tags: req.query.tags as string | string[]
            };

            // Parse format parameter if provided
            if (req.query.format) {
                filters.format = req.query.format as 'funnel' | 'timeline' | 'completion';
            }

            // Default to last 30 days if not provided
            // Parse dates to include full day (start at 00:00:00, end at 23:59:59)
            let endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            let startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
                startDate.setHours(0, 0, 0, 0);
            }

            if (!filters.endDate) {
                endDate.setHours(23, 59, 59, 999);
            }

            const data = await playerJourneyService.getJourneyProgress(gameId, startDate, endDate, filters);

            this.logMemory('journey progress end');
            logAnalyticsMetrics(`[AnalyticsMetrics] journey progress duration: ${Date.now() - startTime}ms`);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getJourneyProgress controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get journey progress'
            });
        }
    }

    /**
     * Get journey data for a specific user
     */
    async getUserJourney(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const userId = req.params.userId;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            const data = await playerJourneyService.getUserJourney(gameId, userId);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getUserJourney controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user journey'
            });
        }
    }
}
