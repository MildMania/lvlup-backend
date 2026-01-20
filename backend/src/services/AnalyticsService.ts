import { PrismaClient } from '@prisma/client';
import { EventData, BatchEventData, UserProfile, SessionData, AnalyticsData } from '../types/api';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { cache, generateCacheKey } from '../utils/simpleCache';

export class AnalyticsService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || new PrismaClient();
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
                    deviceId: userProfile.deviceId ?? null,
                    platform: userProfile.platform ?? null,
                    version: userProfile.version ?? null,
                    country: userProfile.country ?? null,
                    language: userProfile.language ?? null,
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
    async updateSessionHeartbeat(sessionId: string) {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId },
                select: { startTime: true }
            });

            if (!session) {
                throw new Error('Session not found');
            }

            const now = new Date();
            const duration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

            await this.prisma.session.update({
                where: { id: sessionId },
                data: {
                    lastHeartbeat: now,
                    endTime: now,
                    duration: Math.max(duration, 0)
                }
            });

            logger.debug(`Updated heartbeat, endTime, and duration (${duration}s) for session ${sessionId}`);
        } catch (error) {
            logger.error('Error updating session heartbeat:', error);
            throw error;
        }
    }

    // Track single event
    async trackEvent(gameId: string, userId: string, sessionId: string | null, eventData: EventData) {
        try {
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
            
            const event = await this.prisma.event.create({
                data: {
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
                    bundleId: eventData.bundleId ?? null,
                    engineVersion: eventData.engineVersion ?? null,
                    sdkVersion: eventData.sdkVersion ?? null,
                    
                    // Network & Additional
                    connectionType: eventData.connectionType ?? null,
                    sessionNum: eventData.sessionNum ?? null,
                    appSignature: eventData.appSignature ?? null,
                    channelId: eventData.channelId ?? null,
                    
                    // Geographic location
                    country: eventData.country ?? null,
                    countryCode: eventData.countryCode ?? null,
                    region: eventData.region ?? null,
                    city: eventData.city ?? null,
                    latitude: eventData.latitude ?? null,
                    longitude: eventData.longitude ?? null,
                    timezone: eventData.timezone ?? null,
                    
                    // Level funnel tracking (for AB testing level designs)
                    // Extracted from properties (new SDK format) or top-level (backward compatibility)
                    levelFunnel: levelFunnel,
                    levelFunnelVersion: levelFunnelVersion,
                }
            });

            logger.debug(`Event ${eventData.eventName} tracked for user ${userId} with full metadata`);
            return event;
        } catch (error) {
            logger.error('Error tracking event:', error);
            throw error;
        }
    }

    // Track batch events (for offline queue flush)
    async trackBatchEvents(gameId: string, batchData: BatchEventData) {
        try {
            // Get or create user
            const userProfile: UserProfile = {
                externalId: batchData.userId,
                ...(batchData.deviceInfo?.deviceId && { deviceId: batchData.deviceInfo.deviceId }),
                ...(batchData.deviceInfo?.platform && { platform: batchData.deviceInfo.platform }),
                ...((batchData.deviceInfo?.appVersion || batchData.deviceInfo?.version) && {
                    version: batchData.deviceInfo.appVersion || batchData.deviceInfo.version
                }),
            };

            const user = await this.getOrCreateUser(gameId, userProfile);

            // Extract device info for easier access
            const deviceInfo = batchData.deviceInfo || {};

            // Create events in batch with comprehensive metadata
            // Prioritize event-level metadata over batch deviceInfo
            const events = batchData.events.map(eventData => {
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
                
                return {
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
                    bundleId: eventData.bundleId ?? deviceInfo.bundleId ?? null,
                    engineVersion: eventData.engineVersion ?? deviceInfo.engineVersion ?? null,
                    sdkVersion: eventData.sdkVersion ?? deviceInfo.sdkVersion ?? null,
                    
                    // Network & Additional - prefer event-level, fallback to deviceInfo
                    connectionType: eventData.connectionType ?? deviceInfo.connectionType ?? null,
                    sessionNum: eventData.sessionNum ?? deviceInfo.sessionNum ?? null,
                    appSignature: eventData.appSignature ?? deviceInfo.appSignature ?? null,
                    channelId: eventData.channelId ?? deviceInfo.channelId ?? null,
                    
                    // Geographic location
                    country: eventData.country ?? null,
                    countryCode: eventData.countryCode ?? null,
                    region: eventData.region ?? null,
                    city: eventData.city ?? null,
                    latitude: eventData.latitude ?? null,
                    longitude: eventData.longitude ?? null,
                    timezone: eventData.timezone ?? null,
                    
                    // Level funnel tracking (for AB testing level designs)
                    // Extracted from properties (new SDK format) or top-level (backward compatibility)
                    levelFunnel: levelFunnel,
                    levelFunnelVersion: levelFunnelVersion,
                };
            });

            const createdEvents = await this.prisma.event.createMany({
                data: events
            });

            logger.info(`Batch tracked ${createdEvents.count} events for user ${batchData.userId} with full device metadata`);
            return createdEvents;
        } catch (error) {
            logger.error('Error tracking batch events:', error);
            throw error;
        }
    }

    // Get analytics data (for dashboard)
    async getAnalytics(gameId: string, startDate: Date, endDate: Date): Promise<AnalyticsData> {
        try {
            // Generate cache key based on game ID and date range
            const cacheKey = generateCacheKey('analytics', gameId, startDate.toISOString(), endDate.toISOString());
            
            // Try to get from cache first (5 minute TTL)
            const cached = cache.get(cacheKey) as AnalyticsData | undefined;
            if (cached) {
                logger.debug(`Cache hit for analytics: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for analytics: ${cacheKey}, fetching from database`);

            const [
                totalEvents,
                newUsers,
                totalActiveUsers,
                totalSessions,
                avgSessionDuration,
                topEvents
            ] = await Promise.all([
                // Total events
                this.prisma.event.count({
                    where: {
                        gameId: gameId,
                        timestamp: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                }),

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

                // Total active users (had activity in date range)
                this.prisma.user.count({
                    where: {
                        gameId: gameId,
                        OR: [
                            {
                                events: {
                                    some: {
                                        timestamp: {
                                            gte: startDate,
                                            lte: endDate
                                        }
                                    }
                                }
                            },
                            {
                                sessions: {
                                    some: {
                                        startTime: {
                                            gte: startDate,
                                            lte: endDate
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }),

                // Total sessions
                this.prisma.session.count({
                    where: {
                        gameId: gameId,
                        startTime: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                }),

                // Average session duration
                this.prisma.session.aggregate({
                    where: {
                        gameId: gameId,
                        startTime: {
                            gte: startDate,
                            lte: endDate
                        },
                        duration: {
                            not: null
                        }
                    },
                    _avg: {
                        duration: true
                    }
                }),

                // Top events
                this.prisma.event.groupBy({
                    by: ['eventName'],
                    where: {
                        gameId: gameId,
                        timestamp: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    _count: {
                        eventName: true
                    },
                    orderBy: {
                        _count: {
                            eventName: 'desc'
                        }
                    },
                    take: 10
                })
            ]);

            // Calculate average sessions per user
            const avgSessionsPerUser = totalActiveUsers > 0 ?
                Math.round((totalSessions / totalActiveUsers) * 100) / 100 : 0;

            // Calculate average playtime duration (total session duration / total active users)
            const totalSessionDuration = await this.prisma.session.aggregate({
                where: {
                    gameId: gameId,
                    startTime: {
                        gte: startDate,
                        lte: endDate
                    },
                    duration: {
                        not: null
                    }
                },
                _sum: {
                    duration: true
                }
            });

            const avgPlaytimeDuration = totalActiveUsers > 0 ?
                Math.round((totalSessionDuration._sum.duration || 0) / totalActiveUsers) : 0;

            // Calculate real retention rates using AnalyticsMetricsService
            const { AnalyticsMetricsService } = await import('./AnalyticsMetricsService');
            const metricsService = new AnalyticsMetricsService();

            const retentionData = await metricsService.calculateRetention(
                gameId,
                startDate,
                endDate,
                { retentionDays: [1, 7] }
            );

            const retentionDay1 = retentionData.find(r => r.day === 1)?.percentage || 0;
            const retentionDay7 = retentionData.find(r => r.day === 7)?.percentage || 0;

            // Active users today (users with events today)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const activeUsersToday = await this.prisma.user.count({
                where: {
                    gameId: gameId,
                    OR: [
                        {
                            events: {
                                some: {
                                    timestamp: {
                                        gte: today,
                                        lt: tomorrow
                                    }
                                }
                            }
                        },
                        {
                            sessions: {
                                some: {
                                    startTime: {
                                        gte: today,
                                        lt: tomorrow
                                    }
                                }
                            }
                        }
                    ]
                }
            });

            const result = {
                totalUsers: totalActiveUsers, // Frontend expects totalUsers
                totalActiveUsers, // Deprecated but kept for backward compatibility
                newUsers,
                totalSessions,
                totalEvents,
                avgSessionDuration: Math.round(avgSessionDuration._avg.duration || 0),
                avgSessionsPerUser,
                avgPlaytimeDuration,
                retentionDay1,
                retentionDay7,
                activeUsersToday,
                topEvent: topEvents.length > 0 ? (topEvents[0]?.eventName || 'No events') : 'No events', // Frontend expects single topEvent string
                topEvents: topEvents.map((event: any) => ({
                    name: event.eventName,
                    count: event._count.eventName
                }))
            };

            // Cache the result for 5 minutes (300 seconds)
            cache.set(cacheKey, result, 300);

            return result;
        } catch (error) {
            logger.error('Error getting analytics:', error);
            throw error;
        }
    }

    async getEvents(gameId: string, limit: number = 100, offset: number = 0, sort: string = 'desc') {
        try {
            const events = await this.prisma.event.findMany({
                where: {
                    gameId
                },
                select: {
                    id: true,
                    eventName: true,
                    userId: true,
                    sessionId: true,
                    properties: true,
                    timestamp: true, // Event timestamp (validated client time or server time)
                    
                    // Event metadata
                    eventUuid: true,
                    clientTs: true, // Original client timestamp (for reference)
                    serverReceivedAt: true, // When server received the event
                    
                    // Device & Platform info
                    platform: true,
                    osVersion: true,
                    manufacturer: true,
                    device: true,
                    deviceId: true,
                    
                    // App info
                    appVersion: true,
                    appBuild: true,
                    bundleId: true,
                    engineVersion: true,
                    sdkVersion: true,
                    
                    // Network & Additional
                    connectionType: true,
                    sessionNum: true,
                    appSignature: true,
                    channelId: true,
                    
                    // Geographic location
                    country: true,
                    countryCode: true,
                    region: true,
                    city: true,
                    latitude: true,
                    longitude: true,
                    timezone: true,
                },
                orderBy: {
                    timestamp: sort === 'desc' ? 'desc' : 'asc' // timestamp is server time
                },
                take: limit,
                skip: offset
            });

            // Convert BigInt to string for JSON serialization
            const serializedEvents = events.map(event => ({
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