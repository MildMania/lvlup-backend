import { Prisma, PrismaClient } from '@prisma/client';
import { EventData, BatchEventData, UserProfile, SessionData, AnalyticsData } from '../types/api';
import { RevenueType } from '../types/revenue';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { cache, generateCacheKey } from '../utils/simpleCache';
import prisma from '../prisma';
import { RevenueService } from './RevenueService';
import { eventBatchWriter } from './EventBatchWriter';
import { sessionHeartbeatBatchWriter } from './SessionHeartbeatBatchWriter';
import { HLL } from '../utils/hll';

export class AnalyticsService {
    private prisma: PrismaClient;
    private revenueService: RevenueService;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
        this.revenueService = new RevenueService(prismaClient);
    }

    private static readonly IGNORED_EVENT_NAMES = new Set(['app_paused', 'app_resumed']);

    private shouldIgnoreEvent(eventName?: string): boolean {
        if (!eventName) return false;
        return AnalyticsService.IGNORED_EVENT_NAMES.has(eventName.toLowerCase());
    }

    /**
     * Validate and use client timestamp with fallback to server time
     * 
     * Strategy for EVENTS:
     * - Reject future timestamps (client clock ahead of server)
     * - Accept timestamps up to 7 days in the past (offline events)
     * - Preserves temporal accuracy for offline events
     * - Protects against clock manipulation
     * 
     * Critical for: DAU/MAU, retention analysis, funnel timing
     */
    private validateClientTimestamp(clientTs?: number): Date {
        const serverTime = new Date();
        
        if (!clientTs) {
            return serverTime;
        }

        const clientTime = new Date(clientTs);
        const timeDiff = serverTime.getTime() - clientTime.getTime();
        const MAX_PAST_DRIFT = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        // Reject future timestamps (client clock is ahead)
        if (timeDiff < 0) {
            const futureHours = Math.floor(Math.abs(timeDiff) / 1000 / 60 / 60);
            logger.warn(`Client timestamp rejected (${futureHours}h in future): ${clientTs}, using server time`);
            return serverTime;
        }

        // Reject timestamps too far in the past (>7 days old)
        if (timeDiff > MAX_PAST_DRIFT) {
            const pastHours = Math.floor(timeDiff / 1000 / 60 / 60);
            logger.warn(`Client timestamp rejected (${pastHours}h in past): ${clientTs}, using server time`);
            return serverTime;
        }

        // Client timestamp is reasonable, use it
        return clientTime;
    }
    // Create or get user
    async getOrCreateUser(gameId: string, userProfile: UserProfile) {
        try {
            const user = await this.prisma.user.upsert({
                where: {
                    gameId_externalId: {
                        gameId: gameId,
                        externalId: userProfile.externalId
                    }
                },
                update: {
                    deviceId: userProfile.deviceId ?? undefined,
                    // Only update platform if we have a value and user's platform is currently null
                    platform: userProfile.platform ?? undefined,
                    version: userProfile.version ?? undefined,
                    country: userProfile.country ?? undefined,
                    language: userProfile.language ?? undefined,
                    updatedAt: new Date()
                },
                create: {
                    gameId: gameId,
                    externalId: userProfile.externalId,
                    deviceId: userProfile.deviceId ?? null,
                    platform: userProfile.platform ?? null,
                    version: userProfile.version ?? null,
                    country: userProfile.country ?? null,
                    language: userProfile.language ?? null
                }
            });

            logger.info(`User ${user.externalId} processed for game ${gameId}`);
            return user;
        } catch (error) {
            logger.error('Error in getOrCreateUser:', error);
            throw error;
        }
    }

    // Start a new session
    async startSession(gameId: string, userId: string, sessionData: SessionData) {
        try {
            const sessionId = uuidv4();

            const session = await this.prisma.session.create({
                data: {
                    id: sessionId,
                    gameId: gameId,
                    userId: userId,
                    startTime: new Date(sessionData.startTime),
                    platform: sessionData.platform ?? null,
                    version: sessionData.appVersion ?? sessionData.version ?? null, // Use appVersion first, fallback to version
                    countryCode: sessionData.countryCode ?? null // Store country code directly on session
                }
            });

            logger.info(`Session ${session.id} started for user ${userId}`);
            return session;
        } catch (error) {
            logger.error('Error starting session:', error);
            throw error;
        }
    }

    // End a session
    async endSession(sessionId: string, endTime: string) {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId }
            });

            if (!session) {
                throw new Error('Session not found');
            }

            const requestedEndTime = new Date(endTime);
            
            // Use the later of requested endTime or lastHeartbeat
            // This handles cases where heartbeats arrived after endSession was called
            const actualEndTime = session.lastHeartbeat && session.lastHeartbeat > requestedEndTime 
                ? session.lastHeartbeat 
                : requestedEndTime;
            
            const duration = Math.floor((actualEndTime.getTime() - session.startTime.getTime()) / 1000);

            const updatedSession = await this.prisma.session.update({
                where: { id: sessionId },
                data: {
                    endTime: actualEndTime, // Use actualEndTime, not requested endTime
                    duration: Math.max(duration, 0) // Ensure non-negative duration
                }
            });

            logger.info(`Session ${sessionId} ended, duration: ${duration}s (requested: ${requestedEndTime.toISOString()}, actual: ${actualEndTime.toISOString()}, lastHeartbeat: ${session.lastHeartbeat?.toISOString() || 'none'})`);
            return updatedSession;
        } catch (error) {
            logger.error('Error ending session:', error);
            throw error;
        }
    }

    // Update session heartbeat
    // Updates lastHeartbeat, endTime, and duration on every heartbeat
    // This ensures sessions have accurate data even if endSession is never called
    // Uses server timestamp only - no client timestamp needed for heartbeats
    // Optionally updates countryCode if provided and session doesn't have it yet
    async updateSessionHeartbeat(sessionId: string, countryCode?: string | null) {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId },
                select: { startTime: true, lastHeartbeat: true, countryCode: true }
            });

            if (!session) {
                throw new Error('Session not found');
            }

            const now = new Date();
            
            // Sanity check: heartbeat should not be before startTime
            if (now < session.startTime) {
                logger.warn(`Heartbeat timestamp (${now.toISOString()}) is before session startTime (${session.startTime.toISOString()}). Using startTime as heartbeat.`);
                // Use startTime as fallback to prevent negative duration
                sessionHeartbeatBatchWriter.enqueue({
                    sessionId,
                    lastHeartbeat: session.startTime,
                    duration: 0,
                    countryCode: countryCode || session.countryCode || null
                });
                return;
            }

            // Sanity check: heartbeat should not go backwards in time
            if (session.lastHeartbeat && now < session.lastHeartbeat) {
                logger.warn(`Heartbeat timestamp (${now.toISOString()}) is before previous heartbeat (${session.lastHeartbeat.toISOString()}). Ignoring out-of-order heartbeat.`);
                return; // Don't update with backwards timestamp
            }

            const duration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

            // Enqueue heartbeat for batched processing (non-blocking)
            sessionHeartbeatBatchWriter.enqueue({
                sessionId,
                lastHeartbeat: now,
                duration: Math.max(duration, 0),
                countryCode: countryCode || session.countryCode || null
            });

            logger.debug(`Enqueued heartbeat update for session ${sessionId} (duration: ${duration}s)`);
        } catch (error) {
            logger.error('Error updating session heartbeat:', error);
            throw error;
        }
    }

    // Track single event
    async trackEvent(gameId: string, userId: string, sessionId: string | null, eventData: EventData) {
        try {
            if (this.shouldIgnoreEvent(eventData.eventName)) {
                logger.debug(`Ignored event ${eventData.eventName} (user: ${userId})`);
                return {
                    id: 'ignored',
                    timestamp: this.validateClientTimestamp(eventData.clientTs),
                    eventName: eventData.eventName
                } as any;
            }

            // Extract levelFunnel fields from properties (new SDK) or top-level (backward compatibility)
            const properties = { ...(eventData.properties || {}) };
            const levelFunnel = (properties as any).levelFunnel ?? eventData.levelFunnel ?? null;
            const levelFunnelVersion = (properties as any).levelFunnelVersion ?? eventData.levelFunnelVersion ?? null;
            
            // Debug logging
            if (levelFunnel || levelFunnelVersion) {
                logger.info(`Extracted levelFunnel: ${levelFunnel}, levelFunnelVersion: ${levelFunnelVersion} from event ${eventData.eventName}`);
            }
            
            // Remove levelFunnel fields from properties since they're stored in dedicated columns
            delete (properties as any).levelFunnel;
            delete (properties as any).levelFunnelVersion;
            
            // Use validated client timestamp for accurate temporal ordering
            // Critical for offline events and analytics accuracy (DAU, retention, funnels)
            const eventTimestamp = this.validateClientTimestamp(eventData.clientTs);
            const serverTime = new Date(); // Actual server receipt time
            
            // Prepare event data for batch writer
            const eventRecord = {
                gameId: gameId,
                userId: userId,
                sessionId: sessionId,
                eventName: eventData.eventName,
                properties: properties,
                timestamp: eventTimestamp, // Use validated client timestamp
                
                // Event metadata
                eventUuid: eventData.eventUuid ?? null,
                // Store original client timestamp for reference
                clientTs: eventData.clientTs ? BigInt(eventData.clientTs) : 
                          (eventData.timestamp ? BigInt(new Date(eventData.timestamp).getTime()) : null),
                serverReceivedAt: serverTime, // Track when server received the event
                
                // Device & Platform info
                platform: eventData.platform ?? null,
                osVersion: eventData.osVersion ?? null,
                manufacturer: eventData.manufacturer ?? null,
                device: eventData.device ?? null,
                deviceId: eventData.deviceId ?? null,
                
                // App info
                appVersion: eventData.appVersion ?? null,
                appBuild: eventData.appBuild ?? null,
                sdkVersion: eventData.sdkVersion ?? null,
                
                // Network & Additional
                connectionType: eventData.connectionType ?? null,
                sessionNum: eventData.sessionNum ?? null,
                
                // Geographic location (minimal)
                countryCode: eventData.countryCode ?? null,
                
                // Level funnel tracking (for AB testing level designs)
                // Extracted from properties (new SDK format) or top-level (backward compatibility)
                levelFunnel: levelFunnel,
                levelFunnelVersion: levelFunnelVersion,
            };
            
            // Enqueue event for batched insertion (non-blocking)
            eventBatchWriter.enqueue(eventRecord);

            logger.debug(`Event ${eventData.eventName} enqueued for batch write (user: ${userId})`);
            
            // Dual-write pattern: Create revenue record for monetization events
            if (eventData.eventName === 'ad_impression' || eventData.eventName === 'iap_purchase') {
                try {
                    // Pass a synthetic event ID (we don't have the real one yet due to batching)
                    // Revenue tracking will work independently
                    await this.trackRevenueFromEvent(gameId, userId, sessionId, eventData, 'pending');
                } catch (revenueError) {
                    // Don't fail the event tracking if revenue tracking fails
                    logger.error(`Failed to create revenue record for ${eventData.eventName}:`, revenueError);
                }
            }
            
            // Return a synthetic response (we don't have the DB-generated ID yet)
            return {
                id: 'batched', // Indicate this was batched
                timestamp: eventTimestamp,
                eventName: eventData.eventName,
            } as any;
        } catch (error) {
            logger.error('Error tracking event:', error);
            throw error;
        }
    }

    /**
     * Extract revenue data from event and create revenue record (dual-write pattern)
     */
    private async trackRevenueFromEvent(
        gameId: string,
        userId: string,
        sessionId: string | null,
        eventData: EventData,
        eventId: string
    ) {
        const props = eventData.properties || {};
        
        if (eventData.eventName === 'ad_impression') {
            // Extract ad impression revenue data
            const revenue = (props as any).revenue || 0;
            if (revenue <= 0) return; // Skip if no revenue
            
            const revenueData: any = {
                revenueType: RevenueType.AD_IMPRESSION,
                revenue,
                currency: (props as any).revenueCurrency || 'USD',
                timestamp: eventData.timestamp,
                clientTs: eventData.clientTs,
                transactionTimestamp: (props as any).impressionTimestamp,
                adNetworkName: (props as any).adNetworkName || 'Unknown',
                adFormat: (props as any).adFormat || 'Unknown',
                adUnitId: (props as any).adUnitId,
                adPlacement: (props as any).placement,
                adImpressionId: (props as any).impressionId,
                platform: eventData.platform,
                appVersion: eventData.appVersion,
                countryCode: eventData.countryCode,
            };
            
            await this.revenueService.trackRevenue(gameId, userId, sessionId, revenueData, eventData);
            
        } else if (eventData.eventName === 'iap_purchase') {
            // Extract in-app purchase revenue data
            const revenue = (props as any).revenue || (props as any).price || 0;
            if (revenue <= 0) return; // Skip if no revenue
            
            const revenueData: any = {
                revenueType: RevenueType.IN_APP_PURCHASE,
                revenue,
                currency: (props as any).currency || 'USD',
                timestamp: eventData.timestamp,
                clientTs: eventData.clientTs,
                transactionTimestamp: (props as any).transactionTimestamp || (props as any).purchaseTimestamp,
                productId: (props as any).productId || 'Unknown',
                transactionId: (props as any).transactionId || (props as any).orderId,
                store: (props as any).store || 'Unknown',
                isVerified: (props as any).isVerified || false,
                platform: eventData.platform,
                appVersion: eventData.appVersion,
                countryCode: eventData.countryCode,
            };
            
            await this.revenueService.trackRevenue(gameId, userId, sessionId, revenueData, eventData);
        }
    }

    // Track batch events (for offline queue flush)
    async trackBatchEvents(gameId: string, batchData: BatchEventData) {
        try {
            const eventsToTrack = batchData.events.filter(
                (eventData) => !this.shouldIgnoreEvent(eventData.eventName)
            );

            if (eventsToTrack.length === 0) {
                logger.debug(`Ignored entire batch for user ${batchData.userId} (all events filtered)`);
                return { count: 0 };
            }

            // Get or create user
            // Extract country from first event if available (EventData has country/countryCode)
            const firstEvent = eventsToTrack[0];
            const userProfile: UserProfile = {
                externalId: batchData.userId,
                ...(batchData.deviceInfo?.deviceId && { deviceId: batchData.deviceInfo.deviceId }),
                ...(batchData.deviceInfo?.platform && { platform: batchData.deviceInfo.platform }),
                ...((batchData.deviceInfo?.appVersion || batchData.deviceInfo?.version) && {
                    version: batchData.deviceInfo.appVersion || batchData.deviceInfo.version
                }),
                ...(firstEvent?.countryCode && { country: firstEvent.countryCode }),
            };

            const user = await this.getOrCreateUser(gameId, userProfile);

            // Extract device info for easier access
            const deviceInfo = batchData.deviceInfo || {};

            // Enqueue all events for batched insertion
            // Prioritize event-level metadata over batch deviceInfo
            eventsToTrack.forEach(eventData => {
                // Extract levelFunnel fields from properties (new SDK) or top-level (backward compatibility)
                const properties = { ...(eventData.properties || {}) };
                const levelFunnel = (properties as any).levelFunnel ?? eventData.levelFunnel ?? null;
                const levelFunnelVersion = (properties as any).levelFunnelVersion ?? eventData.levelFunnelVersion ?? null;
                
                // Debug logging
                if (levelFunnel || levelFunnelVersion) {
                    logger.info(`Extracted levelFunnel: ${levelFunnel}, levelFunnelVersion: ${levelFunnelVersion} from event ${eventData.eventName}`);
                }
                
                // Remove levelFunnel fields from properties since they're stored in dedicated columns
                delete (properties as any).levelFunnel;
                delete (properties as any).levelFunnelVersion;
                
                // Use validated client timestamp for each event in batch
                // Critical for offline events to preserve temporal sequence
                const eventTimestamp = this.validateClientTimestamp(eventData.clientTs);
                const serverTime = new Date(); // Server receipt time
                
                const eventRecord = {
                    gameId: gameId,
                    userId: user.id,
                    sessionId: batchData.sessionId || null,
                    eventName: eventData.eventName,
                    properties: properties,
                    timestamp: eventTimestamp, // Use validated client timestamp
                    
                    // Event metadata
                    eventUuid: eventData.eventUuid ?? null,
                    clientTs: eventData.clientTs ? BigInt(eventData.clientTs) : null,
                    serverReceivedAt: serverTime, // Track when server received
                    
                    // Device & Platform info - prefer event-level, fallback to deviceInfo
                    platform: eventData.platform ?? deviceInfo.platform ?? null,
                    osVersion: eventData.osVersion ?? deviceInfo.osVersion ?? null,
                    manufacturer: eventData.manufacturer ?? deviceInfo.manufacturer ?? null,
                    device: eventData.device ?? deviceInfo.device ?? null,
                    deviceId: eventData.deviceId ?? deviceInfo.deviceId ?? null,
                    
                    // App info - prefer event-level, fallback to deviceInfo
                    appVersion: eventData.appVersion ?? deviceInfo.appVersion ?? null,
                    appBuild: eventData.appBuild ?? deviceInfo.appBuild ?? null,
                    sdkVersion: eventData.sdkVersion ?? deviceInfo.sdkVersion ?? null,
                    
                    // Network & Additional - prefer event-level, fallback to deviceInfo
                    connectionType: eventData.connectionType ?? deviceInfo.connectionType ?? null,
                    sessionNum: eventData.sessionNum ?? deviceInfo.sessionNum ?? null,
                    
                    // Geographic location (minimal)
                    countryCode: eventData.countryCode ?? null,
                    
                    // Level funnel tracking (for AB testing level designs)
                    // Extracted from properties (new SDK format) or top-level (backward compatibility)
                    levelFunnel: levelFunnel,
                    levelFunnelVersion: levelFunnelVersion,
                };
                
                // Enqueue each event for batched insertion
                eventBatchWriter.enqueue(eventRecord);
            });

            logger.info(`Batch enqueued ${eventsToTrack.length} events for user ${batchData.userId}`);
            
            // Return count of enqueued events
            return { count: eventsToTrack.length };
        } catch (error) {
            logger.error('Error tracking batch events:', error);
            throw error;
        }
    }

    // Get analytics data (for dashboard)
    async getAnalytics(
        gameId: string,
        startDate: Date,
        endDate: Date,
        options?: {
            includeRetention?: boolean;
            includeActiveUsersToday?: boolean;
            includeTopEvents?: boolean;
        }
    ): Promise<AnalyticsData> {
        try {
            const includeRetention = options?.includeRetention !== false;
            const includeActiveUsersToday = options?.includeActiveUsersToday !== false;
            const includeTopEvents = options?.includeTopEvents !== false;

            // Generate cache key based on game ID and date range
            const cacheKey = generateCacheKey(
                'analytics',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify({
                    includeRetention,
                    includeActiveUsersToday,
                    includeTopEvents
                })
            );
            
            // Try to get from cache first (5 minute TTL)
            const cached = cache.get(cacheKey) as AnalyticsData | undefined;
            if (cached) {
                logger.debug(`Cache hit for analytics: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for analytics: ${cacheKey}, fetching from database`);

            const [
                newUsers,
                totalActiveUsers,
                sessionTotals
            ] = await Promise.all([
                // New users (registered in date range)
                this.prisma.user.count({
                    where: {
                        gameId: gameId,
                        createdAt: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                }),

                // Total active users (approximate HLL union)
                this.getActiveUsersApprox(gameId, startDate, endDate),

                // Session totals from rollups
                this.getSessionTotalsFromRollups(gameId, startDate, endDate)
            ]);

            // Calculate average sessions per user
            const totalSessions = sessionTotals.totalSessions;
            const totalSessionDuration = sessionTotals.totalDurationSec;
            const avgSessionDuration = totalSessions > 0 ? Math.round(totalSessionDuration / totalSessions) : 0;
            const avgSessionsPerUser = totalActiveUsers > 0 ?
                Math.round((totalSessions / totalActiveUsers) * 100) / 100 : 0;
            const avgPlaytimeDuration = totalActiveUsers > 0 ?
                Math.round(totalSessionDuration / totalActiveUsers) : 0;

            let retentionDay1 = 0;
            let retentionDay7 = 0;

            if (includeRetention) {
                // Calculate real retention rates using AnalyticsMetricsService
                const { AnalyticsMetricsService } = await import('./AnalyticsMetricsService');
                const metricsService = new AnalyticsMetricsService();

                const retentionData = await metricsService.calculateRetention(
                    gameId,
                    startDate,
                    endDate,
                    { retentionDays: [1, 7] }
                );

                retentionDay1 = retentionData.find(r => r.day === 1)?.percentage || 0;
                retentionDay7 = retentionData.find(r => r.day === 7)?.percentage || 0;
            }

            // Active users today (users with events today)
            let activeUsersToday = 0;
            if (includeActiveUsersToday) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                activeUsersToday = await this.getActiveUsersApprox(gameId, today, tomorrow);
            }

            const result = {
                totalUsers: totalActiveUsers, // Frontend expects totalUsers
                totalActiveUsers, // Deprecated but kept for backward compatibility
                newUsers,
                totalSessions,
                totalEvents: 0,
                avgSessionDuration,
                avgSessionsPerUser,
                avgPlaytimeDuration,
                retentionDay1,
                retentionDay7,
                activeUsersToday,
                topEvent: 'No events',
                topEvents: []
            };

            // Cache the result for 5 minutes (300 seconds)
            cache.set(cacheKey, result, 300);

            return result;
        } catch (error) {
            logger.error('Error getting analytics:', error);
            throw error;
        }
    }

    private async getActiveUsersApprox(gameId: string, startDate: Date, endDate: Date): Promise<number> {
        const rows = await this.prisma.$queryRaw<Array<{ hll: Buffer }>>(Prisma.sql`
            SELECT "hll"
            FROM "active_users_hll_daily"
            WHERE "gameId" = ${gameId}
              AND "date" >= ${startDate}
              AND "date" <= ${endDate}
        `);

        if (!rows.length) {
            return 0;
        }

        const merged = new HLL();
        for (const row of rows) {
            if (row?.hll) {
                merged.union(HLL.fromBuffer(row.hll));
            }
        }
        return merged.count();
    }

    private async getSessionTotalsFromRollups(
        gameId: string,
        startDate: Date,
        endDate: Date
    ): Promise<{ totalSessions: number; totalDurationSec: number }> {
        const rows = await this.prisma.$queryRaw<
            Array<{ total_sessions: bigint; total_duration: bigint }>
        >(Prisma.sql`
            SELECT
                COALESCE(SUM("totalSessions"), 0)::bigint AS "total_sessions",
                COALESCE(SUM("totalDurationSec"), 0)::bigint AS "total_duration"
            FROM "cohort_session_metrics_daily"
            WHERE "gameId" = ${gameId}
              AND ("installDate" + ("dayIndex" || ' days')::interval) >= ${startDate}
              AND ("installDate" + ("dayIndex" || ' days')::interval) <= ${endDate}
        `);

        return {
            totalSessions: Number(rows[0]?.total_sessions || 0),
            totalDurationSec: Number(rows[0]?.total_duration || 0)
        };
    }

    async getEvents(
        gameId: string, 
        limit: number = 100, 
        offset: number = 0, 
        sort: string = 'desc',
        filters?: {
            userId?: string;
            eventName?: string;
            search?: string;
        }
    ) {
        try {
            // To properly merge events from both tables and get the correct top N events,
            // we need to fetch more records initially, then merge, sort, and limit
            // Fetch 3x the limit from each table to ensure we have enough events to merge
            const fetchLimit = Math.max(limit * 3, 300);
            
            // Build where clause for filters
            const whereClause: any = {
                gameId,
                NOT: {
                    serverReceivedAt: null
                }
            };

            // Add userId filter if provided
            if (filters?.userId) {
                whereClause.userId = {
                    contains: filters.userId,
                    mode: 'insensitive'
                };
            }

            // Add eventName filter if provided
            if (filters?.eventName && filters.eventName !== 'all') {
                whereClause.eventName = filters.eventName;
            }

            // Add search filter (searches both userId and eventName)
            if (filters?.search) {
                whereClause.OR = [
                    {
                        userId: {
                            contains: filters.search,
                            mode: 'insensitive'
                        }
                    },
                    {
                        eventName: {
                            contains: filters.search,
                            mode: 'insensitive'
                        }
                    }
                ];
            }
            
            // Fetch regular events (only those with serverReceivedAt set)
            const events = await this.prisma.event.findMany({
                where: whereClause,
                select: {
                    id: true,
                    eventName: true,
                    userId: true,
                    sessionId: true,
                    properties: true,
                    timestamp: true,
                    eventUuid: true,
                    clientTs: true,
                    serverReceivedAt: true,
                    platform: true,
                    osVersion: true,
                    manufacturer: true,
                    device: true,
                    deviceId: true,
                    appVersion: true,
                    appBuild: true,
                    sdkVersion: true,
                    connectionType: true,
                    sessionNum: true,
                    countryCode: true,
                },
                orderBy: {
                    serverReceivedAt: sort === 'desc' ? 'desc' : 'asc'
                },
                take: fetchLimit
            });

            // Fetch revenue events with same filters
            const revenueWhereClause: any = {
                gameId
            };

            // Add userId filter if provided
            if (filters?.userId) {
                revenueWhereClause.userId = {
                    contains: filters.userId,
                    mode: 'insensitive'
                };
            }

            // Add eventName filter if provided (convert to revenueType)
            if (filters?.eventName && filters.eventName !== 'all') {
                if (filters.eventName === 'ad_impression') {
                    revenueWhereClause.revenueType = 'AD_IMPRESSION';
                } else if (filters.eventName === 'in_app_purchase') {
                    revenueWhereClause.revenueType = 'IN_APP_PURCHASE';
                }
            }

            // Add search filter for revenue events
            if (filters?.search) {
                revenueWhereClause.OR = [
                    {
                        userId: {
                            contains: filters.search,
                            mode: 'insensitive'
                        }
                    },
                    {
                        revenueType: {
                            contains: filters.search,
                            mode: 'insensitive'
                        }
                    }
                ];
            }

            const revenueEvents = await this.prisma.revenue.findMany({
                where: revenueWhereClause,
                select: {
                    id: true,
                    userId: true,
                    sessionId: true,
                    revenueType: true,
                    revenue: true,
                    revenueUSD: true,
                    currency: true,
                    timestamp: true,
                    serverReceivedAt: true,
                    platform: true,
                    device: true,
                    deviceId: true,
                    appVersion: true,
                    appBuild: true,
                    countryCode: true,
                    // Ad fields
                    adNetworkName: true,
                    adFormat: true,
                    adPlacement: true,
                    adImpressionId: true,
                    // IAP fields
                    productId: true,
                    transactionId: true,
                    store: true,
                    isVerified: true,
                },
                orderBy: {
                    serverReceivedAt: sort === 'desc' ? 'desc' : 'asc'
                },
                take: fetchLimit
            });

            // Transform revenue events to match event format
            const transformedRevenueEvents = revenueEvents.map(rev => ({
                id: rev.id,
                eventName: rev.revenueType === 'AD_IMPRESSION' ? 'ad_impression' : 'in_app_purchase',
                userId: rev.userId,
                sessionId: rev.sessionId,
                properties: {
                    revenue: rev.revenue,
                    revenueUSD: rev.revenueUSD,
                    currency: rev.currency,
                    ...(rev.revenueType === 'AD_IMPRESSION' ? {
                        adNetworkName: rev.adNetworkName,
                        adFormat: rev.adFormat,
                        adPlacement: rev.adPlacement,
                        adImpressionId: rev.adImpressionId
                    } : {
                        productId: rev.productId,
                        transactionId: rev.transactionId,
                        store: rev.store,
                        isVerified: rev.isVerified
                    })
                },
                timestamp: rev.timestamp,
                eventUuid: null,
                clientTs: null,
                serverReceivedAt: rev.serverReceivedAt,
                platform: rev.platform,
                osVersion: null,
                manufacturer: null,
                device: rev.device,
                deviceId: rev.deviceId,
                appVersion: rev.appVersion,
                appBuild: rev.appBuild,
                sdkVersion: null,
                connectionType: null,
                sessionNum: null,
                countryCode: rev.countryCode,
                isRevenueEvent: true // Flag to identify revenue events in frontend
            }));

            // Merge and sort by serverReceivedAt (when server actually received the event)
            // Fall back to timestamp if serverReceivedAt is null (for older data)
            const allEvents = [...events.map(e => ({ ...e, isRevenueEvent: false })), ...transformedRevenueEvents];
            allEvents.sort((a, b) => {
                const aTime = new Date(a.serverReceivedAt || a.timestamp).getTime();
                const bTime = new Date(b.serverReceivedAt || b.timestamp).getTime();
                return sort === 'desc' ? bTime - aTime : aTime - bTime;
            });

            // Apply limit and offset after merging
            const paginatedEvents = allEvents.slice(offset, offset + limit);

            // Convert BigInt to string for JSON serialization
            const serializedEvents = paginatedEvents.map(event => ({
                ...event,
                clientTs: event.clientTs ? event.clientTs.toString() : null
            }));

            return serializedEvents;
        } catch (error) {
            logger.error('Error getting events:', error);
            throw error;
        }
    }
}
