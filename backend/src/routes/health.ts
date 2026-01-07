import { Router } from 'express';
import { HealthMetricsController } from '../controllers/HealthMetricsController';
import { authenticateApiKey } from '../middleware/auth';

const router = Router();
const healthController = new HealthMetricsController();

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

