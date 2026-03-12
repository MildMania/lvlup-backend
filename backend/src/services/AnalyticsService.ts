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
import clickHouseService from './ClickHouseService';

export class AnalyticsService {
    private prisma: PrismaClient;
    private revenueService: RevenueService;
    private readonly closedSessionExtensionWindowMs: number;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
        this.revenueService = new RevenueService(prismaClient);
        const configuredWindowSec = Number(process.env.SESSION_CLOSED_EXTENSION_WINDOW_SECONDS || 600);
        const safeWindowSec = Number.isFinite(configuredWindowSec) && configuredWindowSec >= 0
            ? Math.floor(configuredWindowSec)
            : 600;
        this.closedSessionExtensionWindowMs = safeWindowSec * 1000;
    }

    private static readonly IGNORED_EVENT_NAMES = new Set(['app_paused', 'app_resumed']);

    private shouldIgnoreEvent(eventName?: string): boolean {
        if (!eventName) return false;
        return AnalyticsService.IGNORED_EVENT_NAMES.has(eventName.toLowerCase());
    }

    private isClickHouseStrict(): boolean {
        return (
            process.env.ANALYTICS_CLICKHOUSE_STRICT === '1' ||
            process.env.ANALYTICS_CLICKHOUSE_STRICT === 'true'
        );
    }

    private readDashboardFromClickHouse(): boolean {
        return (
            process.env.ANALYTICS_READ_DASHBOARD_FROM_CLICKHOUSE === '1' ||
            process.env.ANALYTICS_READ_DASHBOARD_FROM_CLICKHOUSE === 'true'
        );
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
            logger.debug(`Client timestamp rejected (${futureHours}h in future): ${clientTs}, using server time`);
            return serverTime;
        }

        // Reject timestamps too far in the past (>7 days old)
        if (timeDiff > MAX_PAST_DRIFT) {
            const pastHours = Math.floor(timeDiff / 1000 / 60 / 60);
            logger.debug(`Client timestamp rejected (${pastHours}h in past): ${clientTs}, using server time`);
            return serverTime;
        }

        // Client timestamp is reasonable, use it
        return clientTime;
    }

    /**
     * Sanitize session end timestamps coming from clients.
     * Accept small clock drift, clamp invalid/future values to server time.
     */
    private sanitizeSessionEndTimestamp(value: Date, context: { sessionId: string; source: 'requestedEndTime' | 'lastHeartbeat' }): Date {
        const now = new Date();
        const FUTURE_TOLERANCE_MS = 5000;

        if (Number.isNaN(value.getTime())) {
            logger.warn(`[Session] Invalid ${context.source}, falling back to server time`, {
                sessionId: context.sessionId
            });
            return now;
        }

        if (value.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
            logger.warn(`[Session] Future ${context.source} rejected, clamping to server time`, {
                sessionId: context.sessionId,
                sourceTime: value.toISOString(),
                serverTime: now.toISOString()
            });
            return now;
        }

        return value;
    }
    // Create or get user
    async getOrCreateUser(gameId: string, userProfile: UserProfile) {
        try {
            const where = {
                gameId_externalId: {
                    gameId,
                    externalId: userProfile.externalId
                }
            };

            const existingUser = await this.prisma.user.findUnique({ where });

            // Existing user hot path: avoid write when there is no new profile data.
            if (existingUser) {
                const updateData: Prisma.UserUpdateInput = {
                    ...(userProfile.deviceId ? { deviceId: userProfile.deviceId } : {}),
                    ...(userProfile.platform ? { platform: userProfile.platform } : {}),
                    ...(userProfile.version ? { version: userProfile.version } : {}),
                    ...(userProfile.country ? { country: userProfile.country } : {}),
                    ...(userProfile.language ? { language: userProfile.language } : {})
                };

                if (Object.keys(updateData).length === 0) {
                    return existingUser;
                }

                const user = await this.prisma.user.update({
                    where,
                    data: updateData
                });
                return user;
            }

            // Create once without throwing on unique conflicts, then read winner row.
            await this.prisma.user.createMany({
                data: [{
                    gameId,
                    externalId: userProfile.externalId,
                    deviceId: userProfile.deviceId ?? null,
                    platform: userProfile.platform ?? null,
                    version: userProfile.version ?? null,
                    country: userProfile.country ?? null,
                    language: userProfile.language ?? null
                }],
                skipDuplicates: true
            });

            const winner = await this.prisma.user.findUnique({ where });
            if (winner) return winner;
            throw new Error(`Failed to create or fetch user ${userProfile.externalId} for game ${gameId}`);
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

            const requestedEndTime = this.sanitizeSessionEndTimestamp(new Date(endTime), {
                sessionId,
                source: 'requestedEndTime'
            });

            const saneLastHeartbeat = session.lastHeartbeat
                ? this.sanitizeSessionEndTimestamp(session.lastHeartbeat, {
                    sessionId,
                    source: 'lastHeartbeat'
                })
                : null;

            // For already-closed sessions, keep idempotency for stale/duplicate end requests,
            // but allow extending endTime if client sends a later valid end timestamp.
            if (session.endTime) {
                const candidateEndTime = saneLastHeartbeat && saneLastHeartbeat > requestedEndTime
                    ? saneLastHeartbeat
                    : requestedEndTime;

                if (candidateEndTime <= session.endTime) {
                    logger.debug(`Ignoring stale endSession for already closed session ${sessionId} (existing endTime: ${session.endTime.toISOString()}, requested: ${requestedEndTime.toISOString()})`);
                    return session;
                }

                const extensionMs = candidateEndTime.getTime() - session.endTime.getTime();
                if (extensionMs > this.closedSessionExtensionWindowMs) {
                    logger.warn(`[Session] Ignoring late closed-session extension beyond allowed window`, {
                        sessionId,
                        existingEndTime: session.endTime.toISOString(),
                        candidateEndTime: candidateEndTime.toISOString(),
                        extensionMs,
                        allowedWindowMs: this.closedSessionExtensionWindowMs
                    });
                    return session;
                }

                const duration = Math.floor((candidateEndTime.getTime() - session.startTime.getTime()) / 1000);
                const updatedClosedSession = await this.prisma.session.update({
                    where: { id: sessionId },
                    data: {
                        endTime: candidateEndTime,
                        duration: Math.max(duration, 0)
                    }
                });

                logger.info(`Extended closed session ${sessionId} endTime to ${candidateEndTime.toISOString()} (previous: ${session.endTime.toISOString()}, requested: ${requestedEndTime.toISOString()}, lastHeartbeat: ${session.lastHeartbeat?.toISOString() || 'none'})`);
                return updatedClosedSession;
            }
            
            // Use the later of requested endTime or lastHeartbeat
            // This handles cases where heartbeats arrived after endSession was called
            const actualEndTime = saneLastHeartbeat && saneLastHeartbeat > requestedEndTime
                ? saneLastHeartbeat
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
    // Updates lastHeartbeat (and optionally duration) with write throttling
    // Uses server timestamp only - no client timestamp needed for heartbeats
    // Optionally updates countryCode if provided and session doesn't have it yet
    async updateSessionHeartbeat(sessionId: string, countryCode?: string | null) {
        try {
            const now = new Date();

            // Enqueue heartbeat for batched processing (non-blocking)
            sessionHeartbeatBatchWriter.enqueue({
                sessionId,
                lastHeartbeat: now,
                duration: undefined,
                countryCode: countryCode || null
            });
            logger.debug(`Enqueued heartbeat update for session ${sessionId}`);
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
            if (
                eventData.eventName === 'ad_impression' ||
                eventData.eventName === 'iap_purchase' ||
                eventData.eventName === 'in_app_purchase'
            ) {
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
            
        } else if (eventData.eventName === 'iap_purchase' || eventData.eventName === 'in_app_purchase') {
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

            if (this.readDashboardFromClickHouse() && this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
                throw new Error('ClickHouse strict mode enabled for dashboard, but ClickHouse is not configured/enabled in API env');
            }

            if (this.readDashboardFromClickHouse() && clickHouseService.isEnabled()) {
                try {
                    const clickHouseResult = await this.getAnalyticsFromClickHouse(gameId, startDate, endDate, {
                        includeRetention,
                        includeActiveUsersToday,
                        includeTopEvents
                    });
                    cache.set(cacheKey, clickHouseResult, 300);
                    return clickHouseResult;
                } catch (clickHouseError) {
                    if (this.isClickHouseStrict()) throw clickHouseError;
                    logger.warn('[Analytics] ClickHouse dashboard read failed; falling back to Postgres', {
                        gameId,
                        error: clickHouseError instanceof Error ? clickHouseError.message : String(clickHouseError),
                    });
                }
            }

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

    private async getAnalyticsFromClickHouse(
        gameId: string,
        startDate: Date,
        endDate: Date,
        options: {
            includeRetention: boolean;
            includeActiveUsersToday: boolean;
            includeTopEvents: boolean;
        }
    ): Promise<AnalyticsData> {
        const q = (value: string) => this.quoteClickHouseString(value);
        const qGameId = q(gameId);
        const qStart = q(startDate.toISOString());
        const qEnd = q(endDate.toISOString());

        const [newUsersRows, activeUsersRows, sessionTotalsRows] = await Promise.all([
            clickHouseService.query<Array<{ newUsers: number }>[number]>(`
                SELECT uniqExact(id) AS newUsers
                FROM users_raw
                WHERE gameId = ${qGameId}
                  AND createdAt >= parseDateTime64BestEffort(${qStart})
                  AND createdAt <= parseDateTime64BestEffort(${qEnd})
            `),
            clickHouseService.query<Array<{ totalActiveUsers: number }>[number]>(`
                SELECT uniqExact(userId) AS totalActiveUsers
                FROM events_raw
                WHERE gameId = ${qGameId}
                  AND serverReceivedAt >= parseDateTime64BestEffort(${qStart})
                  AND serverReceivedAt <= parseDateTime64BestEffort(${qEnd})
            `),
            clickHouseService.query<Array<{ totalSessions: number; totalDurationSec: number }>[number]>(`
                SELECT
                    toInt64(sum(totalSessions)) AS totalSessions,
                    toInt64(sum(totalDurationSec)) AS totalDurationSec
                FROM cohort_session_metrics_daily_raw
                WHERE gameId = ${qGameId}
                  AND toDate(addDays(installDate, dayIndex)) >= toDate(parseDateTime64BestEffort(${qStart}))
                  AND toDate(addDays(installDate, dayIndex)) <= toDate(parseDateTime64BestEffort(${qEnd}))
            `)
        ]);

        const newUsers = Number(newUsersRows[0]?.newUsers || 0);
        const totalActiveUsers = Number(activeUsersRows[0]?.totalActiveUsers || 0);
        const totalSessions = Number(sessionTotalsRows[0]?.totalSessions || 0);
        const totalSessionDuration = Number(sessionTotalsRows[0]?.totalDurationSec || 0);

        const avgSessionDuration = totalSessions > 0 ? Math.round(totalSessionDuration / totalSessions) : 0;
        const avgSessionsPerUser = totalActiveUsers > 0 ?
            Math.round((totalSessions / totalActiveUsers) * 100) / 100 : 0;
        const avgPlaytimeDuration = totalActiveUsers > 0 ?
            Math.round(totalSessionDuration / totalActiveUsers) : 0;

        let retentionDay1 = 0;
        let retentionDay7 = 0;
        if (options.includeRetention) {
            const { AnalyticsMetricsService } = await import('./AnalyticsMetricsService');
            const metricsService = new AnalyticsMetricsService();
            const retentionData = await metricsService.calculateRetention(
                gameId,
                startDate,
                endDate,
                { retentionDays: [1, 7] }
            );
            retentionDay1 = retentionData.find((r) => r.day === 1)?.percentage || 0;
            retentionDay7 = retentionData.find((r) => r.day === 7)?.percentage || 0;
        }

        let activeUsersToday = 0;
        if (options.includeActiveUsersToday) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const todayRows = await clickHouseService.query<Array<{ activeUsersToday: number }>[number]>(`
                SELECT uniqExact(userId) AS activeUsersToday
                FROM events_raw
                WHERE gameId = ${qGameId}
                  AND serverReceivedAt >= parseDateTime64BestEffort(${q(today.toISOString())})
                  AND serverReceivedAt < parseDateTime64BestEffort(${q(tomorrow.toISOString())})
            `);
            activeUsersToday = Number(todayRows[0]?.activeUsersToday || 0);
        }

        return {
            totalUsers: totalActiveUsers,
            totalActiveUsers,
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
            const readFromClickHouse =
                process.env.ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE === '1' ||
                process.env.ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE === 'true';

            if (readFromClickHouse && clickHouseService.isEnabled()) {
                try {
                    return await this.getEventsFromClickHouse(gameId, limit, offset, sort, filters);
                } catch (clickHouseError) {
                    if (this.isClickHouseStrict()) throw clickHouseError;
                    logger.warn('[Analytics] ClickHouse events read failed; falling back to Postgres', {
                        gameId,
                        error: clickHouseError instanceof Error ? clickHouseError.message : String(clickHouseError),
                    });
                }
            }

            return await this.getEventsFromPostgres(gameId, limit, offset, sort, filters);
        } catch (error) {
            logger.error('Error getting events:', error);
            throw error;
        }
    }

    private async getEventsFromPostgres(
        gameId: string,
        limit: number,
        offset: number,
        sort: string,
        filters?: { userId?: string; eventName?: string; search?: string; }
    ) {
        // Fetch only what can affect the requested page after merge.
        // This sharply reduces I/O and memory compared with fixed 3x over-fetching.
        const fetchLimit = Math.min(Math.max(offset + limit, limit), 2000);
        const isRevenueOnlyEventFilter =
            filters?.eventName === 'ad_impression' || filters?.eventName === 'in_app_purchase';
        const isNonRevenueSpecificEventFilter =
            !!filters?.eventName && filters.eventName !== 'all' && !isRevenueOnlyEventFilter;

        const whereClause: any = {
            gameId,
            NOT: {
                serverReceivedAt: null
            }
        };

        if (filters?.userId) {
            whereClause.userId = {
                contains: filters.userId,
                mode: 'insensitive'
            };
        }

        if (filters?.eventName && filters.eventName !== 'all') {
            whereClause.eventName = filters.eventName;
        }

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

        const eventsPromise = this.prisma.event.findMany({
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

        const revenueWhereClause: any = {
            gameId
        };

        if (filters?.userId) {
            revenueWhereClause.userId = {
                contains: filters.userId,
                mode: 'insensitive'
            };
        }

        if (filters?.eventName && filters.eventName !== 'all') {
            if (filters.eventName === 'ad_impression') {
                revenueWhereClause.revenueType = 'AD_IMPRESSION';
            } else if (filters.eventName === 'in_app_purchase') {
                revenueWhereClause.revenueType = 'IN_APP_PURCHASE';
            }
        }

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

        const revenuePromise: Promise<any[]> = isNonRevenueSpecificEventFilter
            ? Promise.resolve([])
            : this.prisma.revenue.findMany({
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
                    adNetworkName: true,
                    adFormat: true,
                    adPlacement: true,
                    adImpressionId: true,
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

        const [events, revenueEvents] = await Promise.all([eventsPromise, revenuePromise]);
        return this.mergeAndPaginateEventFeed(events, revenueEvents, limit, offset, sort);
    }

    private async getEventsFromClickHouse(
        gameId: string,
        limit: number,
        offset: number,
        sort: string,
        filters?: { userId?: string; eventName?: string; search?: string; }
    ) {
        const fetchLimit = Math.min(Math.max(offset + limit, limit), 2000);
        const isRevenueOnlyEventFilter =
            filters?.eventName === 'ad_impression' || filters?.eventName === 'in_app_purchase';
        const isNonRevenueSpecificEventFilter =
            !!filters?.eventName && filters.eventName !== 'all' && !isRevenueOnlyEventFilter;
        const sortOrder = sort === 'desc' ? 'DESC' : 'ASC';
        const q = (value: string) => this.quoteClickHouseString(value);

        const eventsWhere: string[] = [`gameId = ${q(gameId)}`];
        if (filters?.userId) {
            eventsWhere.push(`positionCaseInsensitiveUTF8(userId, ${q(filters.userId)}) > 0`);
        }
        if (filters?.eventName && filters.eventName !== 'all') {
            eventsWhere.push(`eventName = ${q(filters.eventName)}`);
        }
        if (filters?.search) {
            eventsWhere.push(
                `(positionCaseInsensitiveUTF8(userId, ${q(filters.search)}) > 0 OR positionCaseInsensitiveUTF8(eventName, ${q(filters.search)}) > 0)`
            );
        }

        const eventsSql = `
            SELECT
                id,
                eventName,
                userId,
                sessionId,
                propertiesJson,
                timestamp,
                serverReceivedAt,
                platform,
                countryCode,
                appVersion
            FROM events_raw
            WHERE ${eventsWhere.join(' AND ')}
            ORDER BY serverReceivedAt ${sortOrder}
            LIMIT ${fetchLimit}
        `;

        const eventsRows = await clickHouseService.query<Array<{
            id: string;
            eventName: string;
            userId: string;
            sessionId: string | null;
            propertiesJson: string;
            timestamp: string;
            serverReceivedAt: string;
            platform: string;
            countryCode: string;
            appVersion: string;
        }>[number]>(eventsSql);

        const events = eventsRows.map((row) => ({
            id: row.id,
            eventName: row.eventName,
            userId: row.userId,
            sessionId: row.sessionId || null,
            properties: this.parseClickHouseJson(row.propertiesJson),
            timestamp: new Date(row.timestamp),
            eventUuid: null,
            clientTs: null,
            serverReceivedAt: new Date(row.serverReceivedAt),
            platform: row.platform || null,
            osVersion: null,
            manufacturer: null,
            device: null,
            deviceId: null,
            appVersion: row.appVersion || null,
            appBuild: null,
            sdkVersion: null,
            connectionType: null,
            sessionNum: null,
            countryCode: row.countryCode || null,
        }));

        let revenueEvents: Array<Record<string, any>> = [];
        if (!isNonRevenueSpecificEventFilter) {
            const revenueWhere: string[] = [`gameId = ${q(gameId)}`];
            if (filters?.userId) {
                revenueWhere.push(`positionCaseInsensitiveUTF8(userId, ${q(filters.userId)}) > 0`);
            }
            if (filters?.eventName && filters.eventName !== 'all') {
                if (filters.eventName === 'ad_impression') {
                    revenueWhere.push(`revenueType = 'AD_IMPRESSION'`);
                } else if (filters.eventName === 'in_app_purchase') {
                    revenueWhere.push(`revenueType = 'IN_APP_PURCHASE'`);
                }
            }
            if (filters?.search) {
                revenueWhere.push(
                    `(positionCaseInsensitiveUTF8(userId, ${q(filters.search)}) > 0 OR positionCaseInsensitiveUTF8(revenueType, ${q(filters.search)}) > 0)`
                );
            }

            const revenueSql = `
                SELECT
                    id,
                    userId,
                    sessionId,
                    revenueType,
                    revenueUSD,
                    currency,
                    timestamp,
                    serverReceivedAt,
                    platform,
                    countryCode,
                    appVersion
                FROM revenue_raw
                WHERE ${revenueWhere.join(' AND ')}
                ORDER BY serverReceivedAt ${sortOrder}
                LIMIT ${fetchLimit}
            `;

            const revenueRows = await clickHouseService.query<Array<{
                id: string;
                userId: string;
                sessionId: string | null;
                revenueType: string;
                revenueUSD: number;
                currency: string;
                timestamp: string;
                serverReceivedAt: string;
                platform: string;
                countryCode: string;
                appVersion: string;
            }>[number]>(revenueSql);

            revenueEvents = revenueRows.map((row) => ({
                id: row.id,
                userId: row.userId,
                sessionId: row.sessionId || null,
                revenueType: row.revenueType,
                revenue: null,
                revenueUSD: row.revenueUSD,
                currency: row.currency,
                timestamp: new Date(row.timestamp),
                serverReceivedAt: new Date(row.serverReceivedAt),
                platform: row.platform || null,
                device: null,
                deviceId: null,
                appVersion: row.appVersion || null,
                appBuild: null,
                countryCode: row.countryCode || null,
                adNetworkName: null,
                adFormat: null,
                adPlacement: null,
                adImpressionId: null,
                productId: null,
                transactionId: null,
                store: null,
                isVerified: null,
            }));
        }

        return this.mergeAndPaginateEventFeed(events, revenueEvents, limit, offset, sort);
    }

    private mergeAndPaginateEventFeed(
        events: Array<Record<string, any>>,
        revenueEvents: Array<Record<string, any>>,
        limit: number,
        offset: number,
        sort: string
    ) {
        const transformedRevenueEvents = revenueEvents.map((rev) => ({
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
            isRevenueEvent: true
        }));

        const allEvents: Array<Record<string, any>> = [
            ...events.map(e => ({ ...e, isRevenueEvent: false })),
            ...transformedRevenueEvents
        ];
        allEvents.sort((a, b) => {
            const aTime = new Date(a.serverReceivedAt || a.timestamp).getTime();
            const bTime = new Date(b.serverReceivedAt || b.timestamp).getTime();
            return sort === 'desc' ? bTime - aTime : aTime - bTime;
        });

        const paginatedEvents = allEvents.slice(offset, offset + limit);
        return paginatedEvents.map((event) => ({
            ...event,
            clientTs: event.clientTs ? event.clientTs.toString() : null
        }));
    }

    private quoteClickHouseString(value: string): string {
        const escaped = value
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
        return `'${escaped}'`;
    }

    private parseClickHouseJson(raw: string): Record<string, unknown> {
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
        } catch {
            return { raw };
        }
    }
}
