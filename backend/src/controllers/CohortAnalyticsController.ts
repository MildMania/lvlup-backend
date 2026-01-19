import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { CohortAnalyticsService } from '../services/CohortAnalyticsService';
import { ApiResponse } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';

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
            const gameId = requireGameId(req);

            // Extract filter parameters and split comma-separated values
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',').map(c => c.trim()) : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',').map(p => p.trim()) : undefined,
                version: req.query.version ? (req.query.version as string).split(',').map(v => v.trim()) : undefined,
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
            const gameId = requireGameId(req);
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',').map(c => c.trim()) : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',').map(p => p.trim()) : undefined,
                version: req.query.version ? (req.query.version as string).split(',').map(v => v.trim()) : undefined
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
            const gameId = requireGameId(req);
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',').map(c => c.trim()) : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',').map(p => p.trim()) : undefined,
                version: req.query.version ? (req.query.version as string).split(',').map(v => v.trim()) : undefined
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
            const gameId = requireGameId(req);
            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',').map(c => c.trim()) : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',').map(p => p.trim()) : undefined,
                version: req.query.version ? (req.query.version as string).split(',').map(v => v.trim()) : undefined
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

    async getAvgCompletedLevels(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            // Get gameId from query parameter or from authenticated game
            const gameId = (req.query.gameId as string) || req.game?.id;
            
            if (!gameId) {
                res.status(400).json({ success: false, error: 'gameId is required' });
                return;
            }

            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',') : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',') : undefined,
                version: req.query.version ? (req.query.version as string).split(',') : undefined
            };

            if (req.query.days) {
                filters.days = (req.query.days as string).split(',').map(day => parseInt(day.trim(), 10));
            }

            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();
            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30);
            }

            const data = await cohortAnalyticsService.calculateAvgCompletedLevels(gameId, startDate, endDate, filters);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error getting average completed levels:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve average completed levels data' });
        }
    }

    async getAvgReachedLevel(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            // Get gameId from query parameter or from authenticated game
            const gameId = (req.query.gameId as string) || req.game?.id;
            
            if (!gameId) {
                res.status(400).json({ success: false, error: 'gameId is required' });
                return;
            }

            const filters: any = {
                startDate: req.query.startDate as string,
                endDate: req.query.endDate as string,
                country: req.query.country ? (req.query.country as string).split(',') : undefined,
                platform: req.query.platform ? (req.query.platform as string).split(',') : undefined,
                version: req.query.version ? (req.query.version as string).split(',') : undefined
            };

            if (req.query.days) {
                filters.days = (req.query.days as string).split(',').map(day => parseInt(day.trim(), 10));
            }

            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999Z') : new Date();
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00.000Z') : new Date();
            if (!filters.startDate) {
                startDate.setDate(startDate.getDate() - 30);
            }

            const data = await cohortAnalyticsService.calculateAvgReachedLevel(gameId, startDate, endDate, filters);

            res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Error getting average reached level:', error);
            res.status(500).json({ success: false, error: 'Failed to retrieve average reached level data' });
        }
    }
}
