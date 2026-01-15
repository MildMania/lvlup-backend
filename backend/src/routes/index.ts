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

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'lvlup-backend'
    });
});

// Authentication & Authorization Routes
router.use('/auth', authRoutes);
router.use('/teams', teamRoutes);
router.use('/users', userRoutes);
router.use('/', gameAccessRoutes); // Includes /games/:gameId/access and /users/:userId/games

// API Routes
router.use('/analytics', analyticsRoutes);
router.use('/analytics', enhancedAnalyticsRoutes);
router.use('/analytics', dashboardRoutes);
router.use('/analytics/level-funnel', levelFunnelRoutes);
router.use('/games', gameRoutes);
router.use('/ai-context', aiContextRoutes);
router.use('/ai-analytics', aiAnalyticsRoutes);
router.use(healthRoutes);

// TODO: Add these routes as we implement them
// router.use('/config', configRoutes);
// router.use('/abtest', abTestRoutes);

export default router;