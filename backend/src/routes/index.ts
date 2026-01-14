import { Router } from 'express';
import analyticsRoutes from './analytics';
import enhancedAnalyticsRoutes from './analytics-enhanced';
import gameRoutes from './games';
import dashboardRoutes from './dashboard';
import aiContextRoutes from './ai-context';
import aiAnalyticsRoutes from './ai-analytics';
import healthRoutes from './health';
import levelFunnelRoutes from './level-funnel';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'lvlup-backend'
    });
});

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