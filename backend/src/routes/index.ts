import { Router } from 'express';
import analyticsRoutes from './analytics';
import enhancedAnalyticsRoutes from './analytics-enhanced';
import gameRoutes from './games';

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
router.use('/analytics/enhanced', enhancedAnalyticsRoutes);
router.use('/games', gameRoutes);

// TODO: Add these routes as we implement them
// router.use('/config', configRoutes);
// router.use('/abtest', abTestRoutes);

export default router;