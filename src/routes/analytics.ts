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
router.post('/events', analyticsController.trackEvent);

/**
 * POST /analytics/events/batch - Track multiple events in a batch
 * @body {BatchEventData} - Batch event data with userId, events array
 */
router.post('/events/batch', analyticsController.trackBatchEvents);

// Session endpoints
/**
 * POST /analytics/sessions - Start a new session
 * @body {SessionData} - Session data with userId, startTime, platform, version
 */
router.post('/sessions', analyticsController.startSession);

/**
 * PUT /analytics/sessions/:sessionId - End a session
 * @param {string} sessionId - The ID of the session to end
 * @body {Object} - Object containing endTime (optional, defaults to now)
 */
router.put('/sessions/:sessionId', analyticsController.endSession);

// Basic analytics data endpoints (for dashboard)
/**
 * GET /analytics/dashboard - Get general analytics data
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 */
router.get('/dashboard', analyticsController.getAnalytics);

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
router.get('/metrics/retention', analyticsMetricsController.getRetention);

/**
 * GET /analytics/metrics/active-users - Get DAU, WAU, MAU metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 */
router.get('/metrics/active-users', analyticsMetricsController.getActiveUsers);

/**
 * GET /analytics/metrics/playtime - Get playtime and session metrics
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 */
router.get('/metrics/playtime', analyticsMetricsController.getPlaytimeMetrics);

export default router;