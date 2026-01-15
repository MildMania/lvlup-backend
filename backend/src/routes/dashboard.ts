import { Router } from 'express';
import { AnalyticsMetricsController } from '../controllers/AnalyticsMetricsController';
import { authenticateEither } from '../middleware/authenticateEither';
import { AuthenticatedRequest } from '../middleware/auth';
import { AnalyticsService } from '../services/AnalyticsService';
import { AnalyticsMetricsService } from '../services/AnalyticsMetricsService';
import { PlayerJourneyService } from '../services/PlayerJourneyService';

const router = Router();
const analyticsMetricsController = new AnalyticsMetricsController();

// Dashboard summary endpoint
router.get('/dashboard/summary', authenticateEither, async (req: AuthenticatedRequest, res) => {
    try {
        // Get gameId from query params (dashboard auth) or from authenticated game (API key auth)
        const gameId = (req.query.gameId as string) || req.game?.id;
        
        if (!gameId) {
            return res.status(400).json({
                success: false,
                error: 'gameId is required as a query parameter',
            });
        }

        // Get date range from query parameters or default to last 30 days
        const { startDate: startDateParam, endDate: endDateParam } = req.query;

        let startDate: Date;
        let endDate: Date;

        if (startDateParam && endDateParam && typeof startDateParam === 'string' && typeof endDateParam === 'string') {
            startDate = new Date(startDateParam);
            endDate = new Date(endDateParam);
            // Set endDate to end of day
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Default to last 30 days
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }

        // Initialize services
        const analyticsService = new AnalyticsService();
        const analyticsMetricsService = new AnalyticsMetricsService();

        // Get base analytics data
        const analyticsData = await analyticsService.getAnalytics(gameId, startDate, endDate);

        // Get retention data
        const retentionData = await analyticsMetricsService.calculateRetention(
            gameId,
            startDate,
            endDate,
            { retentionDays: [1, 7] }
        );

        // Get active users today using analytics metrics service
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const activeUsersData = await analyticsMetricsService.calculateActiveUsers(
            gameId,
            todayStart,
            todayEnd
        );

        const summary = {
            totalUsers: analyticsData.totalActiveUsers,
            newUsers: analyticsData.newUsers,
            totalSessions: analyticsData.totalSessions,
            totalEvents: analyticsData.totalEvents,
            avgSessionDuration: analyticsData.avgSessionDuration,
            avgSessionsPerUser: analyticsData.avgSessionsPerUser,
            avgPlaytimeDuration: analyticsData.avgPlaytimeDuration,
            retentionDay1: retentionData.find(r => r.day === 1)?.percentage || 0,
            retentionDay7: retentionData.find(r => r.day === 7)?.percentage || 0,
            activeUsersToday: activeUsersData && activeUsersData.length > 0 ? activeUsersData[0]?.dau || 0 : 0,
            topEvent: analyticsData.topEvents && analyticsData.topEvents.length > 0 ? analyticsData.topEvents[0]?.name || 'No events' : 'No events'
        };

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard summary'
        });
    }
});

// Player journey funnel endpoint
router.get('/player-journey/funnel', authenticateEither, async (req: AuthenticatedRequest, res) => {
    try {
        // Get gameId from query params (dashboard auth) or from authenticated game (API key auth)
        const gameId = (req.query.gameId as string) || req.game?.id;
        
        if (!gameId) {
            return res.status(400).json({
                success: false,
                error: 'gameId is required as a query parameter',
            });
        }

        // Get date range from query parameters or default to last 30 days
        const { startDate: startDateParam, endDate: endDateParam } = req.query;

        let startDate: Date;
        let endDate: Date;

        if (startDateParam && endDateParam && typeof startDateParam === 'string' && typeof endDateParam === 'string') {
            startDate = new Date(startDateParam);
            endDate = new Date(endDateParam);
            // Set endDate to end of day
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Default to last 30 days
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }

        // Initialize player journey service
        const playerJourneyService = new PlayerJourneyService();

        // Get journey progress data
        const journeyData = await playerJourneyService.getJourneyProgress(
            gameId,
            startDate,
            endDate
        );

        // Transform the data to match frontend expectations
        const funnelData = journeyData.checkpoints.map((checkpoint) => ({
            checkpointName: checkpoint.name,
            totalUsers: journeyData.totalUsers,
            completedUsers: checkpoint.count,
            completionRate: checkpoint.percentage,
            order: 0 // PlayerJourneyService doesn't return order, but checkpoints are already ordered
        }));

        res.json({
            success: true,
            data: funnelData
        });

    } catch (error) {
        console.error('Player journey error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch player journey data'
        });
    }
});

// Retention analysis endpoint - use existing analytics controller
router.get('/retention/cohorts', authenticateEither, (req, res) => {
    // Set default date range for retention analysis (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Set default query parameters if not provided
    req.query.startDate = req.query.startDate || startDate.toISOString().split('T')[0];
    req.query.endDate = req.query.endDate || endDate.toISOString().split('T')[0];
    req.query.retentionDays = req.query.retentionDays || '1,3,7,14,30';

    // Use the existing analytics controller
    analyticsMetricsController.getRetention(req, res);
});

export default router;