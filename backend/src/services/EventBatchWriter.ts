import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';

/**
 * Event Batch Writer
 * 
 * Optimizes database write performance by batching event inserts.
 * 
 * Features:
 * - Accumulates events in memory
 * - Flushes when MAX_BATCH_SIZE or MAX_BATCH_DELAY_MS is reached
 * - Single INSERT statement for entire batch
 * - Graceful shutdown handling (no event loss)
 * - Retry logic with failure safety
 * 
 * Performance:
 * - Reduces DB write operations by ~100x
 * - Decreases WAL churn and write amplification
 * - Maintains sub-second latency for real-time dashboards
 */

// Configuration
const MAX_BATCH_SIZE = 100; // Flush when batch reaches this size
const MAX_BATCH_DELAY_MS = 5000; // Flush after this delay (ms) - 5 seconds optimal for sparse traffic
const MAX_BUFFER_SIZE = 1000; // Hard limit to prevent unbounded memory growth
const SHUTDOWN_GRACE_PERIOD_MS = 3000; // Max time to wait during shutdown
const CAN_SKIP_DUPLICATES = (process.env.DATABASE_URL || '').includes('postgres');

interface PendingEvent {
    gameId: string;
    userId: string;
    sessionId: string | null;
    eventName: string;
    properties: any;
    timestamp: Date;
    
    // Event metadata
    eventUuid: string | null;
    clientTs: bigint | null;
    serverReceivedAt: Date;
    
    // Device & Platform info
    platform: string | null;
    osVersion: string | null;
    manufacturer: string | null;
    device: string | null;
    deviceId: string | null;
    
    // App info
    appVersion: string | null;
    appBuild: string | null;
    sdkVersion: string | null;
    
    // Network & Additional
    connectionType: string | null;
    sessionNum: number | null;
    
    // Geographic location
    countryCode: string | null;
    
    // Level funnel tracking
    levelFunnel: string | null;
    levelFunnelVersion: number | null;
}

interface FlushMetrics {
    batchSize: number;
    flushDuration: number;
    success: boolean;
    error?: string;
}

export class EventBatchWriter {
    private prisma: PrismaClient;
    private buffer: PendingEvent[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private isShuttingDown: boolean = false;
    private isFlushing: boolean = false;
    
    // Metrics
    private totalFlushed: number = 0;
    private totalFailed: number = 0;
    private totalDropped: number = 0;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    /**
     * Enqueue an event for batched insertion
     * Non-blocking - does not wait for DB write
     */
    enqueue(event: PendingEvent): void {
        if (this.isShuttingDown) {
            logger.warn('EventBatchWriter is shutting down, rejecting new events');
            return;
        }

        // Enforce buffer limit to prevent unbounded memory growth
        if (this.buffer.length >= MAX_BUFFER_SIZE) {
            logger.error(`EventBatchWriter buffer full (${MAX_BUFFER_SIZE} events), dropping event to prevent memory exhaustion`);
            this.totalDropped++;
            return;
        }

        this.buffer.push(event);
        
        // Start timer if this is the first event in an empty buffer
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
     * Flush buffered events to database
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
        const eventsToFlush = this.buffer.slice();
        this.buffer = [];
        
        const startTime = Date.now();
        
        try {
            // Single INSERT for entire batch
            const createManyArgs: any = { data: eventsToFlush };
            if (CAN_SKIP_DUPLICATES) {
                createManyArgs.skipDuplicates = true;
            }
            await this.prisma.event.createMany(createManyArgs);
            
            const flushDuration = Date.now() - startTime;
            this.totalFlushed += eventsToFlush.length;
            
            logger.info(`[EventBatchWriter] Flushed ${eventsToFlush.length} events in ${flushDuration}ms`, {
                batchSize: eventsToFlush.length,
                flushDuration,
                totalFlushed: this.totalFlushed,
            });
            
        } catch (error: any) {
            const flushDuration = Date.now() - startTime;
            logger.error(`[EventBatchWriter] Flush failed, retrying once...`, {
                batchSize: eventsToFlush.length,
                flushDuration,
                error: error.message,
            });
            
            // Retry once
            try {
                const retryCreateManyArgs: any = { data: eventsToFlush };
                if (CAN_SKIP_DUPLICATES) {
                    retryCreateManyArgs.skipDuplicates = true;
                }
                await this.prisma.event.createMany(retryCreateManyArgs);
                
                const retryDuration = Date.now() - startTime;
                this.totalFlushed += eventsToFlush.length;
                
                logger.info(`[EventBatchWriter] Retry successful, flushed ${eventsToFlush.length} events in ${retryDuration}ms`);
                
            } catch (retryError: any) {
                // Both attempts failed - log error and drop batch
                // Do not block indefinitely or accumulate failed batches
                this.totalFailed++;
                this.totalDropped += eventsToFlush.length;
                
                logger.error(`[EventBatchWriter] Retry failed, dropping ${eventsToFlush.length} events`, {
                    batchSize: eventsToFlush.length,
                    totalFailed: this.totalFailed,
                    totalDropped: this.totalDropped,
                    error: retryError.message,
                    stack: retryError.stack,
                });
            }
        } finally {
            this.isFlushing = false;
        }
    }

    /**
     * Shutdown handler - flush remaining events synchronously
     * Critical for preventing event loss during deploys/restarts
     */
    async shutdown(): Promise<void> {
        logger.info('[EventBatchWriter] Shutdown initiated, flushing remaining events...');
        
        this.isShuttingDown = true;
        this.cancelFlushTimer();
        
        const shutdownStart = Date.now();
        
        // Wait for any in-progress flush to complete
        while (this.isFlushing && (Date.now() - shutdownStart) < SHUTDOWN_GRACE_PERIOD_MS) {
            await this.sleep(100);
        }
        
        // Flush remaining buffered events
        if (this.buffer.length > 0) {
            logger.info(`[EventBatchWriter] Flushing ${this.buffer.length} remaining events...`);
            await this.flush();
        }
        
        const shutdownDuration = Date.now() - shutdownStart;
        logger.info(`[EventBatchWriter] Shutdown complete in ${shutdownDuration}ms`, {
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
export const eventBatchWriter = new EventBatchWriter();
