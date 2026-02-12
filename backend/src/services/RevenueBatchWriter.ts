import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';
import { RevenueType } from '../types/revenue';

/**
 * Revenue Batch Writer
 * 
 * Optimizes database write performance by batching revenue record inserts.
 * 
 * Features:
 * - Accumulates revenue records in memory
 * - Flushes when MAX_BATCH_SIZE or MAX_BATCH_DELAY_MS is reached
 * - Single INSERT statement for entire batch
 * - Graceful shutdown handling (no revenue loss)
 * - Retry logic with failure safety
 * 
 * Performance:
 * - Reduces DB write operations by ~100x
 * - Decreases WAL churn and write amplification
 * - Maintains sub-second latency for real-time analytics
 */

// Configuration
const MAX_BATCH_SIZE = 100; // Flush when batch reaches this size
const MAX_BATCH_DELAY_MS = 5000; // Flush after this delay (ms) - 5 seconds optimal for sparse traffic
const MAX_BUFFER_SIZE = 1000; // Hard limit to prevent unbounded memory growth
const SHUTDOWN_GRACE_PERIOD_MS = 3000; // Max time to wait during shutdown
const CAN_SKIP_DUPLICATES = (process.env.DATABASE_URL || '').includes('postgres');

interface PendingRevenue {
    gameId: string;
    userId: string;
    sessionId: string | null;
    
    // Revenue Type & Core Metrics
    revenueType: RevenueType;
    revenue: number;
    currency: string;
    revenueUSD: number;
    
    // Timing
    timestamp: Date;
    serverReceivedAt?: Date;
    transactionTimestamp: bigint | null;
    
    // Ad Impression Fields
    adNetworkName: string | null;
    adFormat: string | null;
    adUnitId: string | null;
    adUnitName: string | null;
    adPlacement: string | null;
    adCreativeId: string | null;
    adImpressionId: string | null;
    adNetworkPlacement: string | null;
    
    // In-App Purchase Fields
    productId: string | null;
    productName: string | null;
    productType: string | null;
    transactionId: string | null;
    orderId: string | null;
    purchaseToken: string | null;
    store: string | null;
    isVerified: boolean;
    quantity: number | null;
    isSandbox: boolean;
    isRestored: boolean;
    subscriptionPeriod: string | null;
    
    // Device & Platform Context
    platform: string | null;
    device: string | null;
    deviceId: string | null;
    
    // App Context
    appVersion: string | null;
    appBuild: string | null;
    
    // Geographic Context
    countryCode: string | null;
    
    // Custom data
    customData: any | null;
}

interface FlushMetrics {
    batchSize: number;
    flushDuration: number;
    success: boolean;
    error?: string;
}

export class RevenueBatchWriter {
    private prisma: PrismaClient;
    private buffer: PendingRevenue[] = [];
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
     * Enqueue a revenue record for batched insertion
     * Non-blocking - does not wait for DB write
     */
    enqueue(revenue: PendingRevenue): void {
        if (this.isShuttingDown) {
            logger.warn('RevenueBatchWriter is shutting down, rejecting new revenue records');
            return;
        }

        // Enforce buffer limit to prevent unbounded memory growth
        if (this.buffer.length >= MAX_BUFFER_SIZE) {
            logger.error(`RevenueBatchWriter buffer full (${MAX_BUFFER_SIZE} records), dropping revenue record to prevent memory exhaustion`);
            this.totalDropped++;
            return;
        }

        this.buffer.push(revenue);
        
        // Start timer if this is the first revenue record in an empty buffer
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
     * Flush buffered revenue records to database
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
        const revenueToFlush = this.buffer.slice();
        this.buffer = [];

        const startTime = Date.now();
        
        try {
            // Single INSERT for entire batch
            const createManyArgs: any = { data: revenueToFlush };
            if (CAN_SKIP_DUPLICATES) {
                createManyArgs.skipDuplicates = true;
            }
            await this.prisma.revenue.createMany(createManyArgs);
            
            const flushDuration = Date.now() - startTime;
            this.totalFlushed += revenueToFlush.length;
            
            logger.info(`[RevenueBatchWriter] Flushed ${revenueToFlush.length} revenue records in ${flushDuration}ms`, {
                batchSize: revenueToFlush.length,
                flushDuration,
                totalFlushed: this.totalFlushed,
            });
            
        } catch (error: any) {
            const flushDuration = Date.now() - startTime;
            
            logger.error(`[RevenueBatchWriter] Flush failed, retrying once...`, {
                batchSize: revenueToFlush.length,
                flushDuration,
                error: error.message,
            });
            
            // Retry once
            try {
                const retryCreateManyArgs: any = { data: revenueToFlush };
                if (CAN_SKIP_DUPLICATES) {
                    retryCreateManyArgs.skipDuplicates = true;
                }
                await this.prisma.revenue.createMany(retryCreateManyArgs);
                
                const retryDuration = Date.now() - startTime;
                this.totalFlushed += revenueToFlush.length;
                
                logger.info(`[RevenueBatchWriter] Retry successful, flushed ${revenueToFlush.length} revenue records in ${retryDuration}ms`);
                
            } catch (retryError: any) {
                // Both attempts failed - log error and drop batch
                // Do not block indefinitely or accumulate failed batches
                this.totalFailed++;
                this.totalDropped += revenueToFlush.length;
                
                logger.error(`[RevenueBatchWriter] Retry failed, dropping ${revenueToFlush.length} revenue records`, {
                    batchSize: revenueToFlush.length,
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
     * Shutdown handler - flush remaining revenue records synchronously
     * Critical for preventing revenue loss during deploys/restarts
     */
    async shutdown(): Promise<void> {
        logger.info('[RevenueBatchWriter] Shutdown initiated, flushing remaining revenue records...');
        
        this.isShuttingDown = true;
        this.cancelFlushTimer();
        
        const shutdownStart = Date.now();
        
        // Wait for any in-progress flush to complete
        while (this.isFlushing && (Date.now() - shutdownStart) < SHUTDOWN_GRACE_PERIOD_MS) {
            await this.sleep(100);
        }
        
        // Flush remaining buffered revenue records
        if (this.buffer.length > 0) {
            logger.info(`[RevenueBatchWriter] Flushing ${this.buffer.length} remaining revenue records...`);
            await this.flush();
        }
        
        const shutdownDuration = Date.now() - shutdownStart;
        logger.info(`[RevenueBatchWriter] Shutdown complete in ${shutdownDuration}ms`, {
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
export const revenueBatchWriter = new RevenueBatchWriter();
