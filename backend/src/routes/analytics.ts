import { Router } from 'express';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { AnalyticsMetricsController } from '../controllers/AnalyticsMetricsController';
import { authenticateApiKey } from '../middleware/auth';

/**
 * Analytics routes for tracking game events, sessions, and retrieving analytics data
 * All routes require API key authentication via X-API-Key header or api_key query parameter
 */
const router = Router();
const analyticsController = new AnalyticsController();
const analyticsMetricsController = new AnalyticsMetricsController();

// Apply authentication middleware to all routes
router.use(authenticateApiKey);

// Event tracking endpoints
/**
 * POST /analytics/events - Track a single event
 * @body {EventData} - Event data with eventName, properties, userId
 */
router.post('/events', (req, res) => analyticsController.trackEvent(req, res));

/**
 * POST /analytics/events/batch - Track multiple events in a batch
 * @body {BatchEventData} - Batch event data with userId, events array
 */
router.post('/events/batch', (req, res) => analyticsController.trackBatchEvents(req, res));

/**
 * GET /analytics/events - Get events for a game
 * @query {number} limit - Maximum number of events to return (default: 100)
 * @query {number} offset - Number of events to skip (default: 0)
 * @query {string} sort - Sort order: 'asc' or 'desc' (default: 'desc')
 */
router.get('/events', (req, res) => analyticsController.getEvents(req, res));

// Session endpoints
/**
 * POST /analytics/sessions - Start a new session
 * @body {SessionData} - Session data with userId, startTime, platform, version
 */
router.post('/sessions', (req, res) => analyticsController.startSession(req, res));

/**
 * PUT /analytics/sessions/:sessionId - End a session
 * @param {string} sessionId - The ID of the session to end
 * @body {Object} - Object containing endTime (optional, defaults to now)
 */
router.put('/sessions/:sessionId', (req, res) => analyticsController.endSession(req, res));

/**
 * POST /analytics/sessions/:sessionId/heartbeat - Send session heartbeat
 * @param {string} sessionId - The ID of the session
 * @description Updates the lastHeartbeat timestamp to keep session alive
 */
router.post('/sessions/:sessionId/heartbeat', (req, res) => analyticsController.sessionHeartbeat(req, res));

// Basic analytics data endpoints (for dashboard)
/**
 * GET /analytics/dashboard - Get general analytics data
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 */
router.get('/dashboard', (req, res) => analyticsController.getAnalytics(req, res));

// Advanced metrics endpoints
/**
 * GET /analytics/metrics/retention - Get user retention metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 * @query {string} retentionDays - Optional comma-separated list of retention days (e.g., "1,7,14,30,90")
 */
router.get('/metrics/retention', (req, res) => analyticsMetricsController.getRetention(req, res));

/**
 * GET /analytics/metrics/active-users - Get DAU, WAU, MAU metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 */
router.get('/metrics/active-users', (req, res) => analyticsMetricsController.getActiveUsers(req, res));

/**
 * GET /analytics/metrics/playtime - Get playtime and session metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 */
router.get('/metrics/playtime', (req, res) => analyticsMetricsController.getPlaytimeMetrics(req, res));

export default router;