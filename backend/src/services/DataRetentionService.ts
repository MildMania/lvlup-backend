import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';

/**
 * Data Retention Service
 * Automatically cleans up old data to prevent database bloat
 * 
 * Retention Policies:
 * - Events: 90 days
 * - CrashLogs: 30 days
 * - Sessions: 60 days
 * - AiQueries: 7 days
 * - Users/PlayerCheckpoints: Indefinite (user data)
 */
export class DataRetentionService {
    private prisma: PrismaClient;
    private intervalId: NodeJS.Timeout | null = null;

    // Retention periods in days
    private readonly RETENTION_PERIODS = {
        events: 90,
        crashLogs: 30,
        sessions: 60,
        aiQueries: 7,
        aiInsights: 30,
        businessEvents: 90,
    };

    // Run cleanup daily at 3 AM (low traffic time)
    private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    // Environment-controlled toggle: set DATA_RETENTION_ENABLED=true to allow deletions.
    // Default (unset) is false to avoid accidental deletion of data during development.
    private readonly DELETIONS_ENABLED: boolean = process.env.DATA_RETENTION_ENABLED === 'true';

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    /**
     * Expose whether deletions are enabled (useful for controllers/UI)
     */
    public isDeletionEnabled() {
        return this.DELETIONS_ENABLED;
    }

    /**
     * Start the automated cleanup service
     */
    start() {
        if (this.intervalId) {
            logger.warn('Data retention service is already running');
            return;
        }

        logger.info('Starting data retention service...');
        logger.info(`Data retention deletions enabled: ${this.DELETIONS_ENABLED}`);

        // Run immediately on start, then schedule
        this.runCleanup();

        // Schedule recurring cleanup
        this.intervalId = setInterval(() => {
            this.runCleanup();
        }, this.CLEANUP_INTERVAL_MS);

        logger.info(`Data retention service started (runs every ${this.CLEANUP_INTERVAL_MS / 1000 / 60 / 60} hours)`);
    }

    /**
     * Stop the automated cleanup service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Data retention service stopped');
        }
    }

    /**
     * Run all cleanup operations
     */
    async runCleanup() {
        logger.info('Starting data retention cleanup...');
        const startTime = Date.now();

        try {
            if (this.DELETIONS_ENABLED) {
                const results = await Promise.allSettled([
                    this.cleanupEvents(),
                    this.cleanupCrashLogs(),
                    this.cleanupSessions(),
                    this.cleanupAiQueries(),
                    this.cleanupAiInsights(),
                    this.cleanupBusinessEvents(),
                ]);

                // Log results
                const totalDeleted = results.reduce((sum, result) => {
                    if (result.status === 'fulfilled') {
                        return sum + result.value;
                    }
                    return sum;
                }, 0);

                const duration = Date.now() - startTime;
                logger.info(`Data retention cleanup completed in ${duration}ms. Total records deleted: ${totalDeleted}`);

                // Log any failures
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        const tableName = ['Event', 'CrashLog', 'Session', 'AiQuery', 'AiInsight', 'BusinessEvent'][index];
                        logger.error(`Failed to cleanup ${tableName}:`, result.reason);
                    }
                });
            } else {
                // Dry-run mode: only report eligible counts, do not delete
                const stats = await this.getRetentionStats();
                const totalEligible = (stats.events.eligibleForDeletion || 0)
                    + (stats.crashLogs.eligibleForDeletion || 0)
                    + (stats.sessions.eligibleForDeletion || 0)
                    + (stats.aiQueries.eligibleForDeletion || 0);

                const duration = Date.now() - startTime;
                logger.info(`Data retention dry-run completed in ${duration}ms. Total records eligible for deletion: ${totalEligible}. No deletions performed (DATA_RETENTION_ENABLED not set).`);

                logger.debug('Retention stats (dry-run):', stats as any);
            }

        } catch (error) {
            logger.error('Error during data retention cleanup:', error);
        }
    }

    /**
     * Delete events older than retention period
     */
    private async cleanupEvents(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.events);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.event.deleteMany({
                    where: {
                        timestamp: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} events older than ${this.RETENTION_PERIODS.events} days`);
                return result.count;
            } else {
                // Dry-run: just count eligible records
                const count = await this.prisma.event.count({
                    where: {
                        timestamp: { lt: cutoffDate }
                    }
                });

                logger.info(`Dry-run: ${count} events eligible for deletion (older than ${this.RETENTION_PERIODS.events} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up events:', error);
            throw error;
        }
    }

    /**
     * Delete crash logs older than retention period
     */
    private async cleanupCrashLogs(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.crashLogs);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.crashLog.deleteMany({
                    where: {
                        timestamp: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} crash logs older than ${this.RETENTION_PERIODS.crashLogs} days`);
                return result.count;
            } else {
                const count = await this.prisma.crashLog.count({
                    where: { timestamp: { lt: cutoffDate } }
                });

                logger.info(`Dry-run: ${count} crash logs eligible for deletion (older than ${this.RETENTION_PERIODS.crashLogs} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up crash logs:', error);
            throw error;
        }
    }

    /**
     * Delete sessions older than retention period
     */
    private async cleanupSessions(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.sessions);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.session.deleteMany({
                    where: {
                        startTime: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} sessions older than ${this.RETENTION_PERIODS.sessions} days`);
                return result.count;
            } else {
                const count = await this.prisma.session.count({
                    where: { startTime: { lt: cutoffDate } }
                });

                logger.info(`Dry-run: ${count} sessions eligible for deletion (older than ${this.RETENTION_PERIODS.sessions} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up sessions:', error);
            throw error;
        }
    }

    /**
     * Delete AI queries older than retention period
     */
    private async cleanupAiQueries(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.aiQueries);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.aiQuery.deleteMany({
                    where: {
                        createdAt: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} AI queries older than ${this.RETENTION_PERIODS.aiQueries} days`);
                return result.count;
            } else {
                const count = await this.prisma.aiQuery.count({
                    where: { createdAt: { lt: cutoffDate } }
                });

                logger.info(`Dry-run: ${count} AI queries eligible for deletion (older than ${this.RETENTION_PERIODS.aiQueries} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up AI queries:', error);
            throw error;
        }
    }

    /**
     * Delete AI insights older than retention period
     */
    private async cleanupAiInsights(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.aiInsights);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.aiInsight.deleteMany({
                    where: {
                        createdAt: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} AI insights older than ${this.RETENTION_PERIODS.aiInsights} days`);
                return result.count;
            } else {
                const count = await this.prisma.aiInsight.count({
                    where: { createdAt: { lt: cutoffDate } }
                });

                logger.info(`Dry-run: ${count} AI insights eligible for deletion (older than ${this.RETENTION_PERIODS.aiInsights} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up AI insights:', error);
            throw error;
        }
    }

    /**
     * Delete business events older than retention period
     */
    private async cleanupBusinessEvents(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_PERIODS.businessEvents);

        try {
            if (this.DELETIONS_ENABLED) {
                const result = await this.prisma.businessEvent.deleteMany({
                    where: {
                        createdAt: {
                            lt: cutoffDate
                        }
                    }
                });

                logger.info(`Deleted ${result.count} business events older than ${this.RETENTION_PERIODS.businessEvents} days`);
                return result.count;
            } else {
                const count = await this.prisma.businessEvent.count({
                    where: { createdAt: { lt: cutoffDate } }
                });

                logger.info(`Dry-run: ${count} business events eligible for deletion (older than ${this.RETENTION_PERIODS.businessEvents} days)`);
                return 0;
            }
        } catch (error) {
            logger.error('Error cleaning up business events:', error);
            throw error;
        }
    }

    /**
     * Get current retention statistics
     */
    async getRetentionStats() {
        const cutoffDates = {
            events: new Date(Date.now() - this.RETENTION_PERIODS.events * 24 * 60 * 60 * 1000),
            crashLogs: new Date(Date.now() - this.RETENTION_PERIODS.crashLogs * 24 * 60 * 60 * 1000),
            sessions: new Date(Date.now() - this.RETENTION_PERIODS.sessions * 24 * 60 * 60 * 1000),
            aiQueries: new Date(Date.now() - this.RETENTION_PERIODS.aiQueries * 24 * 60 * 60 * 1000),
        };

        const [oldEvents, oldCrashLogs, oldSessions, oldAiQueries] = await Promise.all([
            this.prisma.event.count({ where: { timestamp: { lt: cutoffDates.events } } }),
            this.prisma.crashLog.count({ where: { timestamp: { lt: cutoffDates.crashLogs } } }),
            this.prisma.session.count({ where: { startTime: { lt: cutoffDates.sessions } } }),
            this.prisma.aiQuery.count({ where: { createdAt: { lt: cutoffDates.aiQueries } } }),
        ]);

        return {
            events: {
                retentionDays: this.RETENTION_PERIODS.events,
                eligibleForDeletion: oldEvents,
            },
            crashLogs: {
                retentionDays: this.RETENTION_PERIODS.crashLogs,
                eligibleForDeletion: oldCrashLogs,
            },
            sessions: {
                retentionDays: this.RETENTION_PERIODS.sessions,
                eligibleForDeletion: oldSessions,
            },
            aiQueries: {
                retentionDays: this.RETENTION_PERIODS.aiQueries,
                eligibleForDeletion: oldAiQueries,
            },
        };
    }

    /**
     * Run cleanup for a specific table only
     */
    async cleanupTable(tableName: 'events' | 'crashLogs' | 'sessions' | 'aiQueries'): Promise<number> {
        if (this.DELETIONS_ENABLED) {
            switch (tableName) {
                case 'events':
                    return await this.cleanupEvents();
                case 'crashLogs':
                    return await this.cleanupCrashLogs();
                case 'sessions':
                    return await this.cleanupSessions();
                case 'aiQueries':
                    return await this.cleanupAiQueries();
                default:
                    throw new Error(`Unknown table: ${tableName}`);
            }
        } else {
            // Dry-run: return 0 (no deletions) but log eligible counts
            const stats = await this.getRetentionStats();
            const mapping: any = {
                events: stats.events.eligibleForDeletion,
                crashLogs: stats.crashLogs.eligibleForDeletion,
                sessions: stats.sessions.eligibleForDeletion,
                aiQueries: stats.aiQueries.eligibleForDeletion,
            };

            const eligible = mapping[tableName] ?? 0;
            logger.info(`Dry-run: ${eligible} records eligible for deletion in table ${tableName}`);
            return 0;
        }
    }
}

// Export singleton instance
export const dataRetentionService = new DataRetentionService();
export default dataRetentionService;

