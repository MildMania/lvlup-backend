import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { CohortAnalyticsService } from '../services/CohortAnalyticsService';
import { ApiResponse } from '../types/api';

const cohortAnalyticsService = new CohortAnalyticsService();

/**
 * Controller for cohort-based analytics
 */
export class CohortAnalyticsController {
    /**
     * Get cohort retention table
     */
    async getCohortRetention(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;

            // Extract filter parameters
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[],
                abTestGroup: req.query.abTestGroup as string
            };

            // Parse days parameter if provided (e.g., "0,1,3,7,14,30")
            if (req.query.days) {
                const daysParam = req.query.days as string;
                filters.days = daysParam.split(',').map(day => parseInt(day.trim(), 10));
            }

            // Default to last 30 days if not provided
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();

            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
            }

            const data = await cohortAnalyticsService.calculateCohortRetention(
                gameId,
                startDate,
                endDate,
                filters
            );

            res.status(200).json({
                success: true,
                data: data
            });
        } catch (error) {
            console.error('Error getting cohort retention:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve cohort retention data'
            });
        }
    }

    /**
     * Get cohort playtime metrics
     */
    async getCohortPlaytime(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            if (req.query.days) {
                filters.days = (req.query.days as string).split(',').map(day => parseInt(day.trim(), 10));
            }

            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();
            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30);
            }

            const data = await cohortAnalyticsService.calculateCohortPlaytime(gameId, startDate, endDate, filters);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error getting cohort playtime:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve cohort playtime data' });
        }
    }

    /**
     * Get cohort session count metrics
     */
    async getCohortSessionCount(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            if (req.query.days) {
                filters.days = (req.query.days as string).split(',').map(day => parseInt(day.trim(), 10));
            }

            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();
            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30);
            }

            const data = await cohortAnalyticsService.calculateCohortSessionCount(gameId, startDate, endDate, filters);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error getting cohort session count:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve cohort session count data' });
        }
    }

    /**
     * Get cohort session length metrics
     */
    async getCohortSessionLength(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = req.game!.id;
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country as string | string[],
                platform: req.query.platform as string | string[],
                version: req.query.version as string | string[]
            };

            if (req.query.days) {
                filters.days = (req.query.days as string).split(',').map(day => parseInt(day.trim(), 10));
            }

            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();
            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30);
            }

            const data = await cohortAnalyticsService.calculateCohortSessionLength(gameId, startDate, endDate, filters);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error getting cohort session length:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve cohort session length data' });
        }
    }
}
