import { Request, Response } from 'express';
import { EngagementMetricsService } from '../services/EngagementMetricsService';
import { AuthenticatedRequest } from '../middleware/auth';
import { AnalyticsFilterParams, ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import logger from '../utils/logger';

const engagementMetricsService = new EngagementMetricsService();

export class EngagementMetricsController {
    /**
     * Get session count metrics per user per day
     */
    async getSessionCounts(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            // Parse days parameter if provided
            if (req.query.days) {
                const daysParam = req.query.days as string;
                filters.days = daysParam.split(',').map(day => parseInt(day.trim(), 10));
            }

            // Parse groupBy parameter if provided
            if (req.query.groupBy) {
                filters.groupBy = req.query.groupBy as 'day' | 'week' | 'month';
            }

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await engagementMetricsService.calculateSessionCounts(
                gameId,
                startDate,
                endDate,
                filters
            );

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getSessionCounts controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get session count metrics'
            });
        }
    }

    /**
     * Get session length metrics per user per day
     */
    async getSessionLengths(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            // Parse days parameter if provided
            if (req.query.days) {
                const daysParam = req.query.days as string;
                filters.days = daysParam.split(',').map(day => parseInt(day.trim(), 10));
            }

            // Parse groupBy parameter if provided
            if (req.query.groupBy) {
                filters.groupBy = req.query.groupBy as 'day' | 'week' | 'month';
            }

            // Parse durationType parameter if provided
            if (req.query.durationType) {
                filters.durationType = req.query.durationType as 'average' | 'total' | 'distribution' | 'all';
            }

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await engagementMetricsService.calculateSessionLengths(
                gameId,
                startDate,
                endDate,
                filters
            );

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getSessionLengths controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get session length metrics'
            });
        }
    }
}