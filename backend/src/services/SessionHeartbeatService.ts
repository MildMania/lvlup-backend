import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prismaInstance from '../prisma';

/**
 * Session Heartbeat Service
 * Automatically closes sessions that haven't received a heartbeat in X minutes
 */
export class SessionHeartbeatService {
    private prisma: PrismaClient;
    private intervalId: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_TIMEOUT_SECONDS = 180; // 3 minutes without heartbeat = session ended
    private readonly CLEANUP_INTERVAL_SECONDS = 60; // Check every 1 minute

    constructor() {
        this.prisma = prismaInstance;
    }

    /**
     * Start the heartbeat monitoring service
     */
    start() {
        if (this.intervalId) {
            logger.warn('Session heartbeat service is already running');
            return;
        }

        logger.info(`Starting session heartbeat service (checking every ${this.CLEANUP_INTERVAL_SECONDS}s, timeout: ${this.HEARTBEAT_TIMEOUT_SECONDS}s)`);
        
        // Run immediately on start
        this.closeInactiveSessions();

        // Then run periodically
        this.intervalId = setInterval(
            () => this.closeInactiveSessions(),
            this.CLEANUP_INTERVAL_SECONDS * 1000
        );
    }

    /**
     * Stop the heartbeat monitoring service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Session heartbeat service stopped');
        }
    }

    /**
     * Update last heartbeat for a session
     */
    async updateHeartbeat(sessionId: string): Promise<void> {
        try {
            await this.prisma.session.update({
                where: { id: sessionId },
                data: {
                    lastHeartbeat: new Date()
                }
            });

            logger.debug(`Updated heartbeat for session ${sessionId}`);
        } catch (error) {
            logger.error(`Error updating heartbeat for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Close sessions that haven't received a heartbeat within the timeout period
     */
    async closeInactiveSessions() {
        try {
            const cutoffTime = new Date(Date.now() - this.HEARTBEAT_TIMEOUT_SECONDS * 1000);

            // Find sessions that:
            // 1. Don't have an endTime (still open)
            // 2. Last heartbeat was before cutoff time (or no heartbeat at all)
            const inactiveSessions = await this.prisma.session.findMany({
                where: {
                    endTime: null,
                    OR: [
                        { lastHeartbeat: null }, // Never received heartbeat (old sessions)
                        { lastHeartbeat: { lt: cutoffTime } } // Heartbeat timed out
                    ]
                },
                select: {
                    id: true,
                    startTime: true,
                    lastHeartbeat: true,
                    platform: true,
                    userId: true
                }
            });

            if (inactiveSessions.length === 0) {
                logger.debug('No inactive sessions to close');
                return;
            }

            logger.info(`Found ${inactiveSessions.length} inactive sessions to close`);

            let closedCount = 0;
            let errorCount = 0;

            for (const session of inactiveSessions) {
                try {
                    // Calculate endTime based on last heartbeat
                    // Use lastHeartbeat if available, otherwise use startTime (for sessions that never got a heartbeat)
                    const endTime = session.lastHeartbeat || session.startTime;
                    const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

                    // Ensure duration is at least positive
                    const finalDuration = Math.max(duration, 0);

                    await this.prisma.session.update({
                        where: { id: session.id },
                        data: {
                            endTime: endTime,
                            duration: finalDuration
                        }
                    });

                    closedCount++;
                    
                    logger.debug(`Closed inactive session ${session.id} (platform: ${session.platform}, duration: ${finalDuration}s, last heartbeat: ${session.lastHeartbeat?.toISOString() || 'never'})`);
                } catch (error) {
                    errorCount++;
                    logger.error(`Error closing inactive session ${session.id}:`, error);
                }
            }

            logger.info(`Inactive session cleanup complete: ${closedCount} closed, ${errorCount} errors`);

            // Log platform breakdown for monitoring
            const platformBreakdown = inactiveSessions.reduce((acc, session) => {
                const platform = session.platform || 'unknown';
                acc[platform] = (acc[platform] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            logger.info('Inactive sessions by platform:', platformBreakdown);

        } catch (error) {
            logger.error('Error in inactive session cleanup:', error);
        }
    }

    /**
     * Get heartbeat statistics
     */
    async getHeartbeatStats() {
        try {
            const cutoffTime = new Date(Date.now() - this.HEARTBEAT_TIMEOUT_SECONDS * 1000);

            const [totalSessions, activeSessions, inactiveSessions, closedSessions] = await Promise.all([
                this.prisma.session.count(),
                this.prisma.session.count({
                    where: {
                        endTime: null,
                        lastHeartbeat: { gte: cutoffTime }
                    }
                }),
                this.prisma.session.count({
                    where: {
                        endTime: null,
                        OR: [
                            { lastHeartbeat: null },
                            { lastHeartbeat: { lt: cutoffTime } }
                        ]
                    }
                }),
                this.prisma.session.count({
                    where: { endTime: { not: null } }
                })
            ]);

            return {
                totalSessions,
                activeSessions,
                inactiveSessions,
                closedSessions,
                openSessions: totalSessions - closedSessions
            };
        } catch (error) {
            logger.error('Error getting heartbeat stats:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const sessionHeartbeatService = new SessionHeartbeatService();

