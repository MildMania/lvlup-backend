import { Request, Response } from 'express';
import { AnalyticsMetricsService } from '../services/AnalyticsMetricsService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types/api';
import logger from '../utils/logger';

const analyticsMetricsService = new AnalyticsMetricsService();

export class AnalyticsMetricsController {
    // Get retention data
    async getRetention(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const startDateStr = req.query.startDate as string || '';
            const endDateStr = req.query.endDate as string || '';

            // Default to last 30 days if not provided
            const endDate = endDateStr ? new Date(endDateStr) : new Date();
            const startDate = startDateStr ? new Date(startDateStr) : new Date();

            if (!startDateStr) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculateRetention(gameId, startDate, endDate);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getRetention controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get retention data'
            });
        }
    }

    // Get active users data
    async getActiveUsers(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const startDateStr = req.query.startDate as string || '';
            const endDateStr = req.query.endDate as string || '';

            // Default to last 30 days if not provided
            const endDate = endDateStr ? new Date(endDateStr) : new Date();
            const startDate = startDateStr ? new Date(startDateStr) : new Date();

            if (!startDateStr) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculateActiveUsers(gameId, startDate, endDate);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getActiveUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get active users data'
            });
        }
    }

    // Get playtime metrics
    async getPlaytimeMetrics(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const startDateStr = req.query.startDate as string || '';
            const endDateStr = req.query.endDate as string || '';

            // Default to last 30 days if not provided
            const endDate = endDateStr ? new Date(endDateStr) : new Date();
            const startDate = startDateStr ? new Date(startDateStr) : new Date();

            if (!startDateStr) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculatePlaytimeMetrics(gameId, startDate, endDate);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getPlaytimeMetrics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get playtime metrics data'
            });
        }
    }
}