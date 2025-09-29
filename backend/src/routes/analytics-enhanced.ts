import { Router } from 'express';
import { EngagementMetricsController } from '../controllers/EngagementMetricsController';
import { PlayerJourneyController } from '../controllers/PlayerJourneyController';
import { authenticateApiKey } from '../middleware/auth';

/**
 * Enhanced Analytics Routes for Engagement Metrics and Player Journey
 */
const router = Router();
const engagementMetricsController = new EngagementMetricsController();
const playerJourneyController = new PlayerJourneyController();

// Apply authentication middleware to all routes
router.use(authenticateApiKey);

// Engagement Metrics Endpoints
/**
 * GET /analytics/metrics/session-count - Get session count metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 * @query {string} days - Optional comma-separated list of days (e.g., "1,7,14,30")
 * @query {string} groupBy - Optional grouping: "day", "week", "month"
 */
router.get('/metrics/session-count', engagementMetricsController.getSessionCounts);

/**
 * GET /analytics/metrics/session-length - Get session length metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 * @query {string} days - Optional comma-separated list of days (e.g., "1,7,14,30")
 * @query {string} groupBy - Optional grouping: "day", "week", "month"
 * @query {string} durationType - Optional type: "average", "total", "distribution", "all"
 */
router.get('/metrics/session-length', engagementMetricsController.getSessionLengths);

// Player Journey Endpoints
/**
 * POST /analytics/journey/checkpoints - Create a new checkpoint
 * @body {Object} - Checkpoint data with name, description, type, tags, order
 */
router.post('/journey/checkpoints', playerJourneyController.createCheckpoint);

/**
 * GET /analytics/journey/checkpoints - Get all checkpoints for a game
 */
router.get('/journey/checkpoints', playerJourneyController.getCheckpoints);

/**
 * POST /analytics/journey/record - Record a player reaching a checkpoint
 * @body {Object} - Player checkpoint data with userId, checkpointId, metadata
 */
router.post('/journey/record', playerJourneyController.recordCheckpoint);

/**
 * GET /analytics/journey/progress - Get journey progress analytics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 * @query {string|string[]} checkpointType - Optional checkpoint type(s) to filter by
 * @query {string|string[]} tags - Optional tags to filter by
 * @query {string} format - Optional format: "funnel", "timeline", "completion"
 */
router.get('/journey/progress', playerJourneyController.getJourneyProgress);

/**
 * GET /analytics/journey/user/:userId - Get journey data for a specific user
 * @param {string} userId - The user ID
 */
router.get('/journey/user/:userId', playerJourneyController.getUserJourney);

export default router;