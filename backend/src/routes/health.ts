import { Router } from 'express';
import { HealthMetricsController } from '../controllers/HealthMetricsController';
import { authenticateApiKey } from '../middleware/auth';
import { sessionMonitoring } from '../services/SessionMonitoringService';
import { ApiResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();
const healthController = new HealthMetricsController();

// Get session health check
router.get('/sessions', async (req, res) => {
  try {
    const report = await sessionMonitoring.runSessionHealthCheck();
    res.status(200).json({
      success: true,
      data: report
    } as ApiResponse);
  } catch (error) {
    logger.error('Error in session health check endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session health check'
    } as ApiResponse);
  }
});

// Get health metrics overview
router.get(
  '/games/:gameId/health/metrics',
  authenticateApiKey,
  (req, res) => healthController.getHealthMetrics(req, res)
);

// Get crash timeline
router.get(
  '/games/:gameId/health/timeline',
  authenticateApiKey,
  (req, res) => healthController.getCrashTimeline(req, res)
);

// Get crash logs with filters and pagination
router.get(
  '/games/:gameId/health/crashes',
  authenticateApiKey,
  (req, res) => healthController.getCrashLogs(req, res)
);

// Get specific crash details
router.get(
  '/crashes/:crashId',
  authenticateApiKey,
  (req, res) => healthController.getCrashDetails(req, res)
);

// Report a crash (from SDK)
router.post(
  '/games/:gameId/crashes',
  authenticateApiKey,
  (req, res) => healthController.reportCrash(req, res)
);

export default router;



