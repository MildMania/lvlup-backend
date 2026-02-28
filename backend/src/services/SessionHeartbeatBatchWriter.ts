import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';

/**
 * Session Heartbeat Batch Writer
 * 
 * Optimizes database write performance by batching session heartbeat updates.
 * 
 * Features:
 * - Accumulates heartbeat updates in memory
 * - Flushes when MAX_BATCH_SIZE or MAX_BATCH_DELAY_MS is reached
 * - Batch UPDATE to optimize heartbeat persistence
 * - Graceful shutdown handling (no heartbeat loss)
 * - Retry logic with failure safety
 * 
 * Performance:
 * - Reduces DB write operations by ~100x
 * - Decreases WAL churn from frequent heartbeat updates
 * - Maintains sub-second latency for session management
 */

// Configuration
const MAX_BATCH_SIZE = 100; // Flush when batch reaches this size
const MAX_BATCH_DELAY_MS = 5000; // Flush after this delay (ms) - 5 seconds optimal for sparse traffic
const MAX_BUFFER_SIZE = 1000; // Hard limit to prevent unbounded memory growth
const SHUTDOWN_GRACE_PERIOD_MS = 3000; // Max time to wait during shutdown

interface PendingHeartbeat {
    sessionId: string;
    lastHeartbeat: Date;
    duration?: number;
    countryCode: string | null;
}

interface FlushMetrics {
    batchSize: number;
    flushDuration: number;
    success: boolean;
    error?: string;
}

export class SessionHeartbeatBatchWriter {
    private prisma: PrismaClient;
    private buffer: PendingHeartbeat[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private isShuttingDown: boolean = false;
    private isFlushing: boolean = false;
    private readonly flushChunkSize: number;
    
    // Metrics
    private totalFlushed: number = 0;
    private totalFailed: number = 0;
    private totalDropped: number = 0;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
        this.flushChunkSize = Math.max(1, Number(process.env.HEARTBEAT_BATCH_UPDATE_CHUNK_SIZE || 250));
    }

    /**
     * Enqueue a heartbeat update for batched processing
     * Non-blocking - does not wait for DB write
     */
    enqueue(heartbeat: PendingHeartbeat): void {
        if (this.isShuttingDown) {
            logger.warn('SessionHeartbeatBatchWriter is shutting down, rejecting new heartbeats');
            return;
        }

        // Enforce buffer limit to prevent unbounded memory growth
        if (this.buffer.length >= MAX_BUFFER_SIZE) {
            logger.error(`SessionHeartbeatBatchWriter buffer full (${MAX_BUFFER_SIZE} heartbeats), dropping heartbeat to prevent memory exhaustion`);
            this.totalDropped++;
            return;
        }

        this.buffer.push(heartbeat);
        
        // Start timer if this is the first heartbeat in an empty buffer
        if (this.buffer.length === 1) {
            this.startFlushTimer();
        }
        
        // Flush immediately if batch size threshold reached
        if (this.buffer.length >= MAX_BATCH_SIZE) {
            this.cancelFlushTimer();
            // Use setImmediate to avoid blocking the request
            setImmediate(() => this.flush());
        }
    }

    /**
     * Start timer-based flush
     */
    private startFlushTimer(): void {
        if (this.flushTimer) {
            return; // Timer already running
        }
        
        this.flushTimer = setTimeout(() => {
            this.flush();
        }, MAX_BATCH_DELAY_MS);
    }

    /**
     * Cancel the flush timer
     */
    private cancelFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * Flush buffered heartbeat updates to database
     * Protected against concurrent flushes
     */
    async flush(): Promise<void> {
        // Prevent concurrent flushes
        if (this.isFlushing) {
            return;
        }
        
        // Nothing to flush
        if (this.buffer.length === 0) {
            this.cancelFlushTimer();
            return;
        }

        this.isFlushing = true;
        this.cancelFlushTimer();
        
        // Take snapshot of current buffer and clear it
        const heartbeatsToFlush = this.buffer.slice();
        this.buffer = [];
        const dedupedHeartbeats = this.dedupeBySession(heartbeatsToFlush);
        
        const startTime = Date.now();
        
        try {
            // Batch update in SQL chunks to minimize roundtrips and WAL churn.
            const updatedCount = await this.batchUpdateHeartbeats(dedupedHeartbeats);
            
            const flushDuration = Date.now() - startTime;
            this.totalFlushed += updatedCount;
            
            logger.info(`[SessionHeartbeatBatchWriter] Flushed ${updatedCount}/${heartbeatsToFlush.length} heartbeats (${dedupedHeartbeats.length} deduped) in ${flushDuration}ms`, {
                batchSize: heartbeatsToFlush.length,
                dedupedBatchSize: dedupedHeartbeats.length,
                successCount: updatedCount,
                flushDuration,
                totalFlushed: this.totalFlushed,
            });
            
        } catch (error: any) {
            const flushDuration = Date.now() - startTime;
            logger.error(`[SessionHeartbeatBatchWriter] Flush failed`, {
                batchSize: heartbeatsToFlush.length,
                flushDuration,
                error: error.message,
            });
            
            // Retry once
            try {
                const updatedCount = await this.batchUpdateHeartbeats(dedupedHeartbeats);
                
                const retryDuration = Date.now() - startTime;
                this.totalFlushed += updatedCount;
                
                logger.info(`[SessionHeartbeatBatchWriter] Retry successful, flushed ${updatedCount}/${heartbeatsToFlush.length} heartbeats in ${retryDuration}ms`);
                
            } catch (retryError: any) {
                // Both attempts failed - log error and drop batch
                // Do not block indefinitely or accumulate failed batches
                this.totalFailed++;
                this.totalDropped += heartbeatsToFlush.length;
                
                logger.error(`[SessionHeartbeatBatchWriter] Retry failed, dropping ${heartbeatsToFlush.length} heartbeats`, {
                    batchSize: heartbeatsToFlush.length,
                    totalFailed: this.totalFailed,
                    totalDropped: this.totalDropped,
                    error: retryError.message,
                });
            }
        } finally {
            this.isFlushing = false;
        }
    }

    private dedupeBySession(heartbeats: PendingHeartbeat[]): PendingHeartbeat[] {
        const latestBySession = new Map<string, PendingHeartbeat>();
        for (const hb of heartbeats) {
            const existing = latestBySession.get(hb.sessionId);
            if (!existing || hb.lastHeartbeat >= existing.lastHeartbeat) {
                latestBySession.set(hb.sessionId, hb);
            }
        }
        return Array.from(latestBySession.values());
    }

    private async batchUpdateHeartbeats(heartbeats: PendingHeartbeat[]): Promise<number> {
        if (heartbeats.length === 0) return 0;

        let updatedTotal = 0;
        for (let i = 0; i < heartbeats.length; i += this.flushChunkSize) {
            const chunk = heartbeats.slice(i, i + this.flushChunkSize);
            const valuesSql = Prisma.join(
                chunk.map((hb) =>
                    Prisma.sql`(${hb.sessionId}, ${hb.lastHeartbeat}, ${hb.duration ?? null}, ${hb.countryCode})`
                )
            );

            const updated = await this.prisma.$executeRaw(Prisma.sql`
                UPDATE "sessions" AS s
                SET
                  "lastHeartbeat" = CASE
                    WHEN s."lastHeartbeat" IS NULL THEN v.last_heartbeat
                    WHEN v.last_heartbeat > s."lastHeartbeat" THEN v.last_heartbeat
                    ELSE s."lastHeartbeat"
                  END,
                  "duration" = CASE
                    WHEN v.duration_sec IS NULL THEN s."duration"
                    WHEN s."duration" IS NULL THEN v.duration_sec
                    WHEN v.duration_sec > s."duration" THEN v.duration_sec
                    ELSE s."duration"
                  END,
                  "countryCode" = CASE
                    WHEN s."countryCode" IS NULL AND v.country_code IS NOT NULL THEN v.country_code
                    ELSE s."countryCode"
                  END
                FROM (
                  VALUES ${valuesSql}
                ) AS v(session_id, last_heartbeat, duration_sec, country_code)
                WHERE s."id" = v.session_id
                  AND s."endTime" IS NULL
            `);
            updatedTotal += Number(updated || 0);
        }

        return updatedTotal;
    }

    /**
     * Shutdown handler - flush remaining heartbeats synchronously
     * Critical for preventing heartbeat loss during deploys/restarts
     */
    async shutdown(): Promise<void> {
        logger.info('[SessionHeartbeatBatchWriter] Shutdown initiated, flushing remaining heartbeats...');
        
        this.isShuttingDown = true;
        this.cancelFlushTimer();
        
        const shutdownStart = Date.now();
        
        // Wait for any in-progress flush to complete
        while (this.isFlushing && (Date.now() - shutdownStart) < SHUTDOWN_GRACE_PERIOD_MS) {
            await this.sleep(100);
        }
        
        // Flush remaining buffered heartbeats
        if (this.buffer.length > 0) {
            logger.info(`[SessionHeartbeatBatchWriter] Flushing ${this.buffer.length} remaining heartbeats...`);
            await this.flush();
        }
        
        const shutdownDuration = Date.now() - shutdownStart;
        logger.info(`[SessionHeartbeatBatchWriter] Shutdown complete in ${shutdownDuration}ms`, {
            totalFlushed: this.totalFlushed,
            totalFailed: this.totalFailed,
            totalDropped: this.totalDropped,
        });
    }

    /**
     * Get current buffer size (for monitoring)
     */
    getBufferSize(): number {
        return this.buffer.length;
    }

    /**
     * Get metrics (for monitoring)
     */
    getMetrics() {
        return {
            bufferSize: this.buffer.length,
            totalFlushed: this.totalFlushed,
            totalFailed: this.totalFailed,
            totalDropped: this.totalDropped,
            isShuttingDown: this.isShuttingDown,
            isFlushing: this.isFlushing,
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
export const sessionHeartbeatBatchWriter = new SessionHeartbeatBatchWriter();
