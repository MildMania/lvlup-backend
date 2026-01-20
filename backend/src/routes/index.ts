import { Router } from 'express';
import analyticsRoutes from './analytics';
import enhancedAnalyticsRoutes from './analytics-enhanced';
import gameRoutes from './games';
import dashboardRoutes from './dashboard';
import aiContextRoutes from './ai-context';
import aiAnalyticsRoutes from './ai-analytics';
import healthRoutes from './health';
import levelFunnelRoutes from './level-funnel';

// Authentication & Authorization routes
import authRoutes from './auth';
import teamRoutes from './teams';
import userRoutes from './users';
import gameAccessRoutes from './game-access';

// Import controllers for top-level routes
import { HealthMetricsController } from '../controllers/HealthMetricsController';
import { authenticateEither } from '../middleware/authenticateEither';
import { truncateCrashData } from '../middleware/truncateCrashData';

const router = Router();
const healthController = new HealthMetricsController();


// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'lvlup-backend'
    });
});

// Crash reporting endpoint (from SDK) - uses API key in X-API-Key header
// Must be BEFORE other routes to avoid conflicts
// Truncate large crash data fields to prevent 413 errors
router.post('/crashes', truncateCrashData, authenticateEither, (req, res) => healthController.reportCrash(req, res));

// Authentication & Authorization Routes (most specific first)
router.use('/auth', authRoutes);
router.use('/teams', teamRoutes);
router.use('/users', userRoutes);

// API Routes - Order matters! More specific paths first
router.use('/analytics/level-funnel', levelFunnelRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/analytics', enhancedAnalyticsRoutes);
router.use('/analytics', dashboardRoutes);
router.use('/games', healthRoutes); // Health routes like /games/:gameId/health/*
router.use('/games', gameRoutes); // General game routes
router.use('/ai-context', aiContextRoutes);
router.use('/ai-analytics', aiAnalyticsRoutes);
router.use('/', gameAccessRoutes); // Includes /games/:gameId/access and /users/:userId/games

// TODO: Add these routes as we implement them
// router.use('/config', configRoutes);
// router.use('/abtest', abTestRoutes);

export default router;