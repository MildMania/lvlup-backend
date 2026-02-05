import { Router } from 'express';
import analyticsRoutes from './analytics';
import enhancedAnalyticsRoutes from './analytics-enhanced';
import gameRoutes from './games';
import dashboardRoutes from './dashboard';
import aiContextRoutes from './ai-context';
import aiAnalyticsRoutes from './ai-analytics';
import healthRoutes from './health';
import levelFunnelRoutes from './level-funnel';
import dataRetentionRoutes from './data-retention';
import configRoutes from './config';

// Authentication & Authorization routes
import authRoutes from './auth';
import teamRoutes from './teams';
import userRoutes from './users';
import gameAccessRoutes from './game-access';

// Import controllers for top-level routes
import { HealthMetricsController } from '../controllers/HealthMetricsController';
import { authenticateEither } from '../middleware/authenticateEither';
import { truncateCrashData } from '../middleware/truncateCrashData';
import { eventBatchWriter } from '../services/EventBatchWriter';
import { cache } from '../utils/simpleCache';
import os from 'os';
import { execSync } from 'child_process';

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

// Batch writer metrics endpoint (for monitoring)
router.get('/metrics/batch-writer', (req, res) => {
    const metrics = eventBatchWriter.getMetrics();
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        batchWriter: metrics
    });
});

// Memory and cache metrics endpoint (for monitoring)
router.get('/metrics/memory', (req, res) => {
    const memory = process.memoryUsage();
    const cacheStats = cache.getStats();
    let processList: string[] = [];

    try {
        const output = execSync('ps -eo pid,comm,rss,pcpu,pmem --sort=-rss | head -n 10', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        processList = output.trim().split('\n');
    } catch {
        // Ignore process listing failures (e.g., restricted environments)
        processList = ['ps command unavailable'];
    }

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        os: {
            totalMem: os.totalmem(),
            freeMem: os.freemem(),
            loadAvg: os.loadavg()
        },
        memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers
        },
        processes: processList,
        cache: {
            size: cacheStats.size,
            totalBytes: cacheStats.totalBytes,
            maxEntries: cacheStats.maxEntries,
            maxBytes: cacheStats.maxBytes
        }
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
router.use('/config', configRoutes); // Remote config routes (/api/configs/* and /api/admin/configs/*)
router.use('/', gameAccessRoutes); // Includes /games/:gameId/access and /users/:userId/games

// Admin Routes
router.use('/admin/data-retention', dataRetentionRoutes);

// TODO: Add these routes as we implement them
// router.use('/abtest', abTestRoutes);

export default router;
