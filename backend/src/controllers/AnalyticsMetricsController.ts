import { Request, Response } from 'express';
import { AnalyticsMetricsService } from '../services/AnalyticsMetricsService';
import { AuthenticatedRequest } from '../middleware/auth';
import { AnalyticsFilterParams, ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import logger from '../utils/logger';

const analyticsMetricsService = new AnalyticsMetricsService();

export class AnalyticsMetricsController {
    // Get retention data with filtering options
    async getRetention(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: AnalyticsFilterParams = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            // Parse retention days if provided
            if (req.query.retentionDays) {
                const daysParam = req.query.retentionDays as string;
                filters.retentionDays = daysParam.split(',').map(day => parseInt(day.trim(), 10));
            }

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculateRetention(
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
            logger.error('Error in getRetention controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get retention data'
            });
        }
    }

    // Get active users data with filtering options
    async getActiveUsers(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: AnalyticsFilterParams = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculateActiveUsers(
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
            logger.error('Error in getActiveUsers controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get active users data'
            });
        }
    }

    // Get playtime metrics with filtering options
    async getPlaytimeMetrics(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Extract filter parameters
            const filters: AnalyticsFilterParams = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await analyticsMetricsService.calculatePlaytimeMetrics(
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
            logger.error('Error in getPlaytimeMetrics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get playtime metrics data'
            });
        }
    }
}