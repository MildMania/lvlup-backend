import { Request, Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse, BatchEventData, EventData, SessionData, UserProfile } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import logger from '../utils/logger';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
    // Track a single event
    async trackEvent(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const eventData: EventData = req.body;
            const userId = req.body.userId;
            const sessionId = req.body.sessionId || null;

            // Validate required fields
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            if (!eventData.eventName) {
                return res.status(400).json({
                    success: false,
                    error: 'Event name is required'
                });
            }

            // Validate event name format (no spaces, special chars)
            if (!/^[a-zA-Z0-9_]+$/.test(eventData.eventName)) {
                return res.status(400).json({
                    success: false,
                    error: 'Event name can only contain letters, numbers and underscores'
                });
            }

            // Validate properties if provided
            if (eventData.properties && typeof eventData.properties !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Event properties must be an object'
                });
            }

            const userProfile: UserProfile = {
                externalId: userId,
                deviceId: req.body.deviceId,
                platform: req.body.platform,
                version: req.body.version,
                country: req.body.country,
                language: req.body.language
            };

            // Create or get user first
            const user = await analyticsService.getOrCreateUser(gameId, userProfile);

            // Then track event for this user
            const event = await analyticsService.trackEvent(
                gameId,
                user.id,
                sessionId,
                eventData
            );

            res.status(200).json({
                success: true,
                data: {
                    eventId: event.id,
                    timestamp: event.timestamp
                }
            });
        } catch (error) {
            logger.error('Error in trackEvent controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to track event'
            });
        }
    }

    // Track multiple events in batch
    async trackBatchEvents(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const batchData: BatchEventData = req.body;

            // Validate required fields
            if (!batchData.userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            if (!batchData.events || !Array.isArray(batchData.events) || batchData.events.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Events array is required and cannot be empty'
                });
            }

            // Validate max batch size
            if (batchData.events.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Batch size exceeds maximum limit of 100 events'
                });
            }

            // Validate each event in the batch
            for (let i = 0; i < batchData.events.length; i++) {
                const event = batchData.events[i];

                if (!event || !event.eventName) {
                    return res.status(400).json({
                        success: false,
                        error: `Event at index ${i} is missing eventName`
                    });
                }

                // Validate event name format
                if (!/^[a-zA-Z0-9_]+$/.test(event.eventName)) {
                    return res.status(400).json({
                        success: false,
                        error: `Event name at index ${i} can only contain letters, numbers and underscores`
                    });
                }
            }

            const result = await analyticsService.trackBatchEvents(gameId, batchData);

            res.status(200).json({
                success: true,
                data: {
                    processed: result.count
                }
            });
        } catch (error) {
            logger.error('Error in trackBatchEvents controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to track batch events'
            });
        }
    }

    // Start a new session
    async startSession(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const userId = req.body.userId;
            const sessionData: SessionData = req.body;

            // Validate required fields
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            // Handle default startTime or validate provided startTime
            if (!sessionData.startTime) {
                sessionData.startTime = new Date().toISOString();
            } else {
                // Validate date format
                const startDate = new Date(sessionData.startTime);
                if (isNaN(startDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid startTime format. Use ISO date format'
                    });
                }

                // Prevent future dates
                if (startDate > new Date()) {
                    return res.status(400).json({
                        success: false,
                        error: 'Session startTime cannot be in the future'
                    });
                }
            }

            // Validate platform and version if provided
            if (sessionData.platform && typeof sessionData.platform !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Platform must be a string'
                });
            }

            if (sessionData.version && typeof sessionData.version !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Version must be a string'
                });
            }

            const userProfile: UserProfile = {
                externalId: userId,
                deviceId: req.body.deviceId,
                platform: req.body.platform,
                version: req.body.version,
                country: req.body.country,
                language: req.body.language
            };

            // Create or get user first
            const user = await analyticsService.getOrCreateUser(gameId, userProfile);

            // Then start a session for this user
            const session = await analyticsService.startSession(
                gameId,
                user.id,
                sessionData
            );

            res.status(200).json({
                success: true,
                data: {
                    sessionId: session.id,
                    startTime: session.startTime
                }
            });
        } catch (error) {
            logger.error('Error in startSession controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to start session'
            });
        }
    }

    // End a session
    async endSession(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const sessionId = req.params.sessionId;
            const endTime = req.body.endTime || new Date().toISOString();

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
            }

            const session = await analyticsService.endSession(sessionId, endTime);

            res.status(200).json({
                success: true,
                data: {
                    sessionId: session.id,
                    duration: session.duration
                }
            });
        } catch (error) {
            logger.error('Error in endSession controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to end session'
            });
        }
    }

    // Send session heartbeat
    async sessionHeartbeat(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const sessionId = req.params.sessionId;

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
            }

            await analyticsService.updateSessionHeartbeat(sessionId);

            res.status(200).json({
                success: true,
                data: {
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            logger.error('Error in sessionHeartbeat controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update session heartbeat'
            });
        }
    }


    // Get analytics data (for dashboard)
    async getAnalytics(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const startDateStr = req.query.startDate as string || '';
            const endDateStr = req.query.endDate as string || '';

            // Default to last 30 days if not provided
            let endDate = endDateStr ? new Date(endDateStr + 'T23:59:59.999Z') : new Date();
            let startDate = startDateStr ? new Date(startDateStr + 'T00:00:00.000Z') : new Date(endDate);

            // Validate date inputs
            if (startDateStr && isNaN(startDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid startDate format. Use ISO date format (YYYY-MM-DD)'
                });
            }

            if (endDateStr && isNaN(endDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid endDate format. Use ISO date format (YYYY-MM-DD)'
                });
            }

            // Set default date range if not provided (last 30 days)
            if (!startDateStr) {
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 30); // Last 30 days
                startDate.setHours(0, 0, 0, 0);
            }

            if (!endDateStr) {
                endDate.setHours(23, 59, 59, 999);
            }

            // Ensure endDate is not before startDate
            if (endDate < startDate) {
                return res.status(400).json({
                    success: false,
                    error: 'endDate cannot be before startDate'
                });
            }

            const data = await analyticsService.getAnalytics(gameId, startDate, endDate);

            res.status(200).json({
                success: true,
                data
            });
        } catch (error) {
            logger.error('Error in getAnalytics controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get analytics data'
            });
        }
    }

    // Get events for a game
    async getEvents(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;
            const sort = (req.query.sort as string) || 'desc';

            const events = await analyticsService.getEvents(gameId, limit, offset, sort);

            res.status(200).json({
                success: true,
                data: events
            });
        } catch (error) {
            logger.error('Error in getEvents controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get events'
            });
        }
    }
}