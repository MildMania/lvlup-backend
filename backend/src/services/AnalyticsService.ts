import { PrismaClient } from '@prisma/client';
import { EventData, BatchEventData, UserProfile, SessionData } from '../types/api';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class AnalyticsService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || new PrismaClient();
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
                    version: sessionData.version ?? null
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

            const endDateTime = new Date(endTime);
            const duration = Math.floor((endDateTime.getTime() - session.startTime.getTime()) / 1000);

            const updatedSession = await this.prisma.session.update({
                where: { id: sessionId },
                data: {
                    endTime: endDateTime,
                    duration: duration
                }
            });

            logger.info(`Session ${sessionId} ended, duration: ${duration}s`);
            return updatedSession;
        } catch (error) {
            logger.error('Error ending session:', error);
            throw error;
        }
    }

    // Track single event
    async trackEvent(gameId: string, userId: string, sessionId: string | null, eventData: EventData) {
        try {
            const event = await this.prisma.event.create({
                data: {
                    gameId: gameId,
                    userId: userId,
                    sessionId: sessionId,
                    eventName: eventData.eventName,
                    properties: eventData.properties || {},
                    timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date()
                }
            });

            logger.debug(`Event ${eventData.eventName} tracked for user ${userId}`);
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
                ...batchData.deviceInfo
            };

            const user = await this.getOrCreateUser(gameId, userProfile);

            // Create events in batch
            const events = batchData.events.map(eventData => ({
                gameId: gameId,
                userId: user.id,
                sessionId: batchData.sessionId || null,
                eventName: eventData.eventName,
                properties: eventData.properties || {},
                timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date()
            }));

            const createdEvents = await this.prisma.event.createMany({
                data: events
            });

            logger.info(`Batch tracked ${createdEvents.count} events for user ${batchData.userId}`);
            return createdEvents;
        } catch (error) {
            logger.error('Error tracking batch events:', error);
            throw error;
        }
    }

    // Get analytics data (for dashboard)
    async getAnalytics(gameId: string, startDate: Date, endDate: Date) {
        try {
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

            return {
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
        } catch (error) {
            logger.error('Error getting analytics:', error);
            throw error;
        }
    }
}