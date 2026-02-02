import { Request, Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';
import { MonetizationCohortService } from '../services/MonetizationCohortService';
import { RevenueService } from '../services/RevenueService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse, BatchEventData, EventData, SessionData, UserProfile } from '../types/api';
import { requireGameId } from '../utils/gameIdHelper';
import logger from '../utils/logger';
import prisma from '../prisma';

const analyticsService = new AnalyticsService();
const monetizationCohortService = new MonetizationCohortService();
const revenueService = new RevenueService();

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
                deviceId: req.body.deviceId || eventData.deviceId,
                platform: req.body.platform || eventData.platform,
                version: req.body.version || eventData.appVersion,
                country: req.body.countryCode,
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

                // Prevent future dates (with 5 second tolerance for clock drift)
                const serverTime = new Date();
                const timeDiffMs = startDate.getTime() - serverTime.getTime();
                const FUTURE_TOLERANCE_MS = 5000; // 5 seconds tolerance
                
                if (timeDiffMs > FUTURE_TOLERANCE_MS) {
                    const diffSeconds = (timeDiffMs / 1000).toFixed(2);
                    logger.warn(
                        `startTime is ${diffSeconds}s in the future (beyond tolerance), resetting to current time. Client Timestamp: ${sessionData.startTime}, Server Timestamp: ${serverTime.toISOString()}`);
                    sessionData.startTime = serverTime.toISOString();
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
            const countryCode = req.body.countryCode || null;

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
            }

            await analyticsService.updateSessionHeartbeat(sessionId, countryCode);

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
            const userId = req.query.userId as string | undefined;
            const eventName = req.query.eventName as string | undefined;
            const search = req.query.search as string | undefined;

            const events = await analyticsService.getEvents(gameId, limit, offset, sort, {
                userId,
                eventName,
                search
            });

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

    // Get revenue summary (total revenue stats)
    async getRevenueSummary(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);

            // Get total revenue by type (use revenueUSD for multi-currency support)
            const revenueByType = await prisma.revenue.groupBy({
                by: ['revenueType'],
                where: { gameId },
                _sum: { revenueUSD: true },
                _count: true
            });

            // Get total revenue count by user (use revenueUSD)
            const userRevenueCount = await prisma.revenue.groupBy({
                by: ['userId'],
                where: { gameId },
                _sum: { revenueUSD: true }
            });

            // Calculate totals
            let totalRevenue = 0;
            let adRevenue = 0;
            let iapRevenue = 0;
            let adImpressionCount = 0;
            let iapCount = 0;

            revenueByType.forEach((item: any) => {
                const revenue = Number(item._sum.revenueUSD || 0);
                totalRevenue += revenue;
                
                if (item.revenueType === 'AD_IMPRESSION') {
                    adRevenue = revenue;
                    adImpressionCount = item._count;
                } else if (item.revenueType === 'IN_APP_PURCHASE') {
                    iapRevenue = revenue;
                    iapCount = item._count;
                }
            });

            // Get paying users count
            const payingUsers = await prisma.revenue.findMany({
                where: {
                    gameId,
                    revenueType: 'IN_APP_PURCHASE'
                },
                distinct: ['userId'],
                select: { userId: true }
            });

            // Get total users
            const totalUsers = await prisma.user.count({ where: { gameId } });

            const summary = {
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                adRevenue: Math.round(adRevenue * 100) / 100,
                iapRevenue: Math.round(iapRevenue * 100) / 100,
                adImpressionCount,
                iapCount,
                payingUsersCount: payingUsers.length,
                totalUsers,
                conversionRate: totalUsers > 0 ? (payingUsers.length / totalUsers) * 100 : 0,
                arpu: totalUsers > 0 ? totalRevenue / totalUsers : 0,
                arppu: payingUsers.length > 0 ? iapRevenue / payingUsers.length : 0
            };

            res.status(200).json({
                success: true,
                data: summary
            });
        } catch (error) {
            logger.error('Error in getRevenueSummary controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get revenue summary'
            });
        }
    }

    // Get monetization cohort analysis
    async getMonetizationCohorts(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            
            // Parse endDate and set to end of day (23:59:59.999) to include the entire day
            let endDate: Date;
            if (req.query.endDate) {
                endDate = new Date(req.query.endDate as string);
                endDate.setHours(23, 59, 59, 999);
            } else {
                endDate = new Date();
                endDate.setHours(23, 59, 59, 999);
            }
            
            const cohortPeriod = (req.query.cohortPeriod as 'day' | 'week' | 'month') || 'day'; // Changed from 'week' to 'day'
            const maxDays = parseInt(req.query.maxDays as string) || 30;

            // Parse filters (same as engagement metrics)
            const filters: any = {};
            
            if (req.query.country) {
                filters.country = req.query.country;
            }
            
            if (req.query.platform) {
                filters.platform = req.query.platform;
            }
            
            if (req.query.version) {
                filters.version = req.query.version;
            }

            const cohorts = await monetizationCohortService.getMonetizationCohorts(
                gameId,
                startDate,
                endDate,
                cohortPeriod,
                maxDays,
                filters
            );

            res.status(200).json({
                success: true,
                data: cohorts
            });
        } catch (error) {
            logger.error('Error in getMonetizationCohorts controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get monetization cohorts'
            });
        }
    }

    // Track revenue (batch of revenue events from SDK)
    async trackRevenue(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const gameId = requireGameId(req);
            const { userId, sessionId, revenueData } = req.body;

            // Validate required fields
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            if (!revenueData || !Array.isArray(revenueData)) {
                return res.status(400).json({
                    success: false,
                    error: 'Revenue data array is required'
                });
            }

            // Get or create user first
            const userProfile: UserProfile = {
                externalId: userId,
                deviceId: revenueData[0]?.deviceId,
                platform: revenueData[0]?.platform,
                version: revenueData[0]?.appVersion,
                country: revenueData[0]?.countryCode
            };

            const user = await analyticsService.getOrCreateUser(gameId, userProfile);

            // Track each revenue item
            const results = [];
            for (const revenue of revenueData) {
                try {
                    const tracked = await revenueService.trackRevenue(
                        gameId,
                        user.id,
                        sessionId || null,
                        revenue,
                        revenue // Pass the revenue object itself as eventMetadata
                    );
                    results.push(tracked);
                } catch (error) {
                    logger.error(`Failed to track revenue item:`, error);
                    // Continue with next item instead of failing entire batch
                }
            }

            res.status(200).json({
                success: true,
                data: {
                    tracked: results.length,
                    total: revenueData.length
                }
            });
        } catch (error) {
            logger.error('Error in trackRevenue controller:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to track revenue'
            });
        }
    }
}