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
                    deviceId: userProfile.deviceId,
                    platform: userProfile.platform,
                    version: userProfile.version,
                    country: userProfile.country,
                    language: userProfile.language,
                    updatedAt: new Date()
                },
                create: {
                    gameId: gameId,
                    externalId: userProfile.externalId,
                    deviceId: userProfile.deviceId,
                    platform: userProfile.platform,
                    version: userProfile.version,
                    country: userProfile.country,
                    language: userProfile.language
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
                    platform: sessionData.platform,
                    version: sessionData.version
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
                sessionId: batchData.sessionId,
                eventName: eventData.eventName,
                properties: eventData.properties || {},
                timestamp: eventData.timestamp ? new Date(eventData.timestamp) : new Date()
            }));

            const createdEvents = await this.prisma.event.createMany({
                data: events,
                skipDuplicates: true
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
                uniqueUsers,
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

                // Unique users
                this.prisma.user.count({
                    where: {
                        gameId: gameId,
                        createdAt: {
                            gte: startDate,
                            lte: endDate
                        }
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
                prisma.session.aggregate({
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
                prisma.event.groupBy({
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

            return {
                totalEvents,
                uniqueUsers,
                totalSessions,
                avgSessionDuration: Math.round(avgSessionDuration._avg.duration || 0),
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