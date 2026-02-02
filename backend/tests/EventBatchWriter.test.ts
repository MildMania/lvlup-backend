import { EventBatchWriter } from '../src/services/EventBatchWriter';
import { PrismaClient } from '@prisma/client';
import { beforeEach, afterEach, describe, it, expect, jest } from '@jest/globals';

/**
 * Event Batch Writer Tests
 * 
 * Tests the core batching logic, flush behavior, and graceful shutdown.
 */

describe('EventBatchWriter', () => {
    let batchWriter: EventBatchWriter;
    let mockPrisma: any;

    beforeEach(() => {
        // Mock Prisma client
        mockPrisma = {
            event: {
                createMany: jest.fn().mockResolvedValue({ count: 0 })
            }
        };
        
        batchWriter = new EventBatchWriter(mockPrisma as PrismaClient);
    });

    afterEach(async () => {
        // Clean shutdown after each test
        await batchWriter.shutdown();
    });

    describe('enqueue', () => {
        it('should add events to buffer', () => {
            const event = createMockEvent('test_event');
            
            batchWriter.enqueue(event);
            
            expect(batchWriter.getBufferSize()).toBe(1);
        });

        it('should not enqueue events during shutdown', async () => {
            await batchWriter.shutdown();
            
            const event = createMockEvent('test_event');
            batchWriter.enqueue(event);
            
            expect(batchWriter.getBufferSize()).toBe(0);
        });

        it('should flush when batch size threshold reached', async () => {
            // Enqueue 100 events (MAX_BATCH_SIZE)
            for (let i = 0; i < 100; i++) {
                batchWriter.enqueue(createMockEvent(`event_${i}`));
            }
            
            // Give time for async flush
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(mockPrisma.event.createMany).toHaveBeenCalled();
            expect(batchWriter.getBufferSize()).toBe(0);
        });
    });

    describe('flush', () => {
        it('should flush buffered events to database', async () => {
            const event1 = createMockEvent('event_1');
            const event2 = createMockEvent('event_2');
            
            batchWriter.enqueue(event1);
            batchWriter.enqueue(event2);
            
            await batchWriter.flush();
            
            expect(mockPrisma.event.createMany).toHaveBeenCalledWith({
                data: [event1, event2],
                skipDuplicates: false
            });
            expect(batchWriter.getBufferSize()).toBe(0);
        });

        it('should handle empty buffer gracefully', async () => {
            await batchWriter.flush();
            
            expect(mockPrisma.event.createMany).not.toHaveBeenCalled();
        });

        it('should retry on failure once', async () => {
            mockPrisma.event.createMany
                .mockRejectedValueOnce(new Error('DB connection failed'))
                .mockResolvedValueOnce({ count: 1 });
            
            const event = createMockEvent('test_event');
            batchWriter.enqueue(event);
            
            await batchWriter.flush();
            
            expect(mockPrisma.event.createMany).toHaveBeenCalledTimes(2);
        });

        it('should drop batch after failed retry', async () => {
            mockPrisma.event.createMany.mockRejectedValue(new Error('DB down'));
            
            const event = createMockEvent('test_event');
            batchWriter.enqueue(event);
            
            await batchWriter.flush();
            
            expect(mockPrisma.event.createMany).toHaveBeenCalledTimes(2);
            expect(batchWriter.getBufferSize()).toBe(0);
            
            const metrics = batchWriter.getMetrics();
            expect(metrics.totalFailed).toBe(1);
            expect(metrics.totalDropped).toBe(1);
        });
    });

    describe('timer-based flush', () => {
        it('should flush after MAX_BATCH_DELAY_MS', async () => {
            const event = createMockEvent('test_event');
            
            batchWriter.enqueue(event);
            
            // Wait for timer (750ms + buffer)
            await new Promise(resolve => setTimeout(resolve, 850));
            
            expect(mockPrisma.event.createMany).toHaveBeenCalled();
            expect(batchWriter.getBufferSize()).toBe(0);
        }, 1000);
    });

    describe('shutdown', () => {
        it('should flush remaining events', async () => {
            const event1 = createMockEvent('event_1');
            const event2 = createMockEvent('event_2');
            
            batchWriter.enqueue(event1);
            batchWriter.enqueue(event2);
            
            await batchWriter.shutdown();
            
            expect(mockPrisma.event.createMany).toHaveBeenCalled();
            expect(batchWriter.getBufferSize()).toBe(0);
            
            const metrics = batchWriter.getMetrics();
            expect(metrics.isShuttingDown).toBe(true);
        });

        it('should wait for in-progress flush', async () => {
            // Simulate slow flush
            mockPrisma.event.createMany.mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve({ count: 1 }), 500))
            );
            
            const event = createMockEvent('test_event');
            batchWriter.enqueue(event);
            
            // Start flush
            const flushPromise = batchWriter.flush();
            
            // Immediately try to shutdown
            await batchWriter.shutdown();
            
            // Flush should have completed
            await flushPromise;
            expect(mockPrisma.event.createMany).toHaveBeenCalled();
        });
    });

    describe('metrics', () => {
        it('should track successful flushes', async () => {
            mockPrisma.event.createMany.mockResolvedValue({ count: 3 });
            
            batchWriter.enqueue(createMockEvent('event_1'));
            batchWriter.enqueue(createMockEvent('event_2'));
            batchWriter.enqueue(createMockEvent('event_3'));
            
            await batchWriter.flush();
            
            const metrics = batchWriter.getMetrics();
            expect(metrics.totalFlushed).toBe(3);
            expect(metrics.totalFailed).toBe(0);
            expect(metrics.totalDropped).toBe(0);
        });

        it('should track failed flushes', async () => {
            mockPrisma.event.createMany.mockRejectedValue(new Error('DB error'));
            
            batchWriter.enqueue(createMockEvent('event_1'));
            batchWriter.enqueue(createMockEvent('event_2'));
            
            await batchWriter.flush();
            
            const metrics = batchWriter.getMetrics();
            expect(metrics.totalFailed).toBe(1);
            expect(metrics.totalDropped).toBe(2);
        });
    });

    describe('concurrency', () => {
        it('should prevent concurrent flushes', async () => {
            mockPrisma.event.createMany.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ count: 1 }), 200))
            );
            
            batchWriter.enqueue(createMockEvent('event_1'));
            batchWriter.enqueue(createMockEvent('event_2'));
            
            // Start two flushes concurrently
            const flush1 = batchWriter.flush();
            const flush2 = batchWriter.flush();
            
            await Promise.all([flush1, flush2]);
            
            // Should only call createMany once
            expect(mockPrisma.event.createMany).toHaveBeenCalledTimes(1);
        });
    });
});

// Helper function to create mock event
function createMockEvent(eventName: string) {
    return {
        gameId: 'test-game-id',
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        eventName: eventName,
        properties: { test: true },
        timestamp: new Date(),
        eventUuid: `uuid-${eventName}`,
        clientTs: BigInt(Date.now()),
        serverReceivedAt: new Date(),
        platform: 'test',
        osVersion: null,
        manufacturer: null,
        device: null,
        deviceId: null,
        appVersion: '1.0.0',
        appBuild: null,
        sdkVersion: null,
        connectionType: null,
        sessionNum: null,
        countryCode: 'US',
        levelFunnel: null,
        levelFunnelVersion: null,
    };
}

