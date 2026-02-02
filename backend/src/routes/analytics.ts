import { Router } from 'express';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { AnalyticsMetricsController } from '../controllers/AnalyticsMetricsController';
import { authenticateEither } from '../middleware/authenticateEither';

/**
 * Analytics routes for tracking game events, sessions, and retrieving analytics data
 * Routes accept BOTH API key authentication (for games) and dashboard authentication (for dashboard users)
 */
const router = Router();
const analyticsController = new AnalyticsController();
const analyticsMetricsController = new AnalyticsMetricsController();

// Apply authentication middleware to all routes - accepts both API key and dashboard auth
router.use(authenticateEither);

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
 * POST /analytics/revenue - Track revenue data (ad impressions, IAPs)
 * @body {Object} - Revenue data with userId, sessionId, revenueData array
 */
router.post('/revenue', (req, res) => analyticsController.trackRevenue(req, res));

/**
 * GET /analytics/events - Get events for a game
 * @query {number} limit - Maximum number of events to return (default: 100)
 * @query {number} offset - Number of events to skip (default: 0)
 * @query {string} sort - Sort order: 'asc' or 'desc' (default: 'desc')
 * @query {string} userId - Filter by user ID (partial match, case-insensitive)
 * @query {string} eventName - Filter by event name (exact match)
 * @query {string} search - Search in userId and eventName (partial match, case-insensitive)
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
 * @body {string} countryCode - Optional ISO country code to update if session doesn't have one yet
 * @description Updates the lastHeartbeat timestamp to keep session alive and optionally updates countryCode
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

/**
 * GET /analytics/metrics/monetization-cohorts - Get monetization cohort analysis
 * @query {string} startDate - Optional start date (ISO format)
 * @query {string} endDate - Optional end date (ISO format)
 * @query {string} cohortPeriod - Optional cohort period: 'day', 'week', 'month' (default: 'week')
 * @query {number} maxDays - Optional maximum days to track (default: 30)
 * @query {string|string[]} country - Optional country or countries to filter by
 * @query {string|string[]} platform - Optional platform or platforms to filter by
 * @query {string|string[]} version - Optional version or versions to filter by
 */
router.get('/metrics/monetization-cohorts', (req, res) => analyticsController.getMonetizationCohorts(req, res));

/**
 * GET /analytics/metrics/revenue-summary - Get total revenue summary (all-time)
 */
router.get('/metrics/revenue-summary', (req, res) => analyticsController.getRevenueSummary(req, res));

export default router;