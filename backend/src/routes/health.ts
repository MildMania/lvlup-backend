import { Router } from 'express';
import { HealthMetricsController } from '../controllers/HealthMetricsController';
import { authenticateEither } from '../middleware/authenticateEither';

const router = Router();
const healthController = new HealthMetricsController();

// Get health metrics overview
router.get(
  '/:gameId/health/metrics',
  authenticateEither,
  (req, res) => healthController.getHealthMetrics(req, res)
);

// Get crash timeline
router.get(
  '/:gameId/health/timeline',
  authenticateEither,
  (req, res) => healthController.getCrashTimeline(req, res)
);

// Get crash logs with filters and pagination
router.get(
  '/:gameId/health/crashes',
  authenticateEither,
  (req, res) => healthController.getCrashLogs(req, res)
);

// Get specific crash details
router.get(
  '/:gameId/crashes/:crashId',
  authenticateEither,
  (req, res) => healthController.getCrashDetails(req, res)
);

// Report a crash (from SDK)
router.post(
  '/:gameId/crashes',
  authenticateEither,
  (req, res) => healthController.reportCrash(req, res)
);

export default router;



