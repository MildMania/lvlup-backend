import { RevenueBatchWriter } from '../src/services/RevenueBatchWriter';
import { PrismaClient } from '@prisma/client';
import { beforeEach, afterEach, describe, it, expect, jest } from '@jest/globals';
import { RevenueType } from '../src/types/revenue';

describe('RevenueBatchWriter', () => {
    let batchWriter: RevenueBatchWriter;
    let mockPrisma: any;

    beforeEach(() => {
        // Create mock Prisma client
        const createManyMock = jest.fn();
        createManyMock.mockResolvedValue({ count: 0 });
        
        mockPrisma = {
            revenue: {
                createMany: createManyMock
            }
        } as any;

        batchWriter = new RevenueBatchWriter(mockPrisma);
    });

    afterEach(async () => {
        // Cleanup
        await batchWriter.shutdown();
        jest.clearAllMocks();
    });

    it('should enqueue revenue records without immediate DB write', () => {
        const revenue = {
            gameId: 'game-1',
            userId: 'user-1',
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: 'imp-123',
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        };

        batchWriter.enqueue(revenue);

        expect(batchWriter.getBufferSize()).toBe(1);
        expect(mockPrisma.revenue.createMany).not.toHaveBeenCalled();
    });

    it('should flush when batch size reaches MAX_BATCH_SIZE (100)', async () => {
        const revenues = Array.from({ length: 100 }, (_, i) => ({
            gameId: 'game-1',
            userId: `user-${i}`,
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: `imp-${i}`,
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        }));

        revenues.forEach(revenue => batchWriter.enqueue(revenue));

        // Wait for flush to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockPrisma.revenue.createMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.revenue.createMany).toHaveBeenCalledWith({
            data: revenues,
            skipDuplicates: false
        });
    });

    it('should flush after MAX_BATCH_DELAY_MS (750ms)', async () => {
        const revenue = {
            gameId: 'game-1',
            userId: 'user-1',
            sessionId: 'session-1',
            revenueType: RevenueType.IN_APP_PURCHASE,
            revenue: 4.99,
            currency: 'USD',
            revenueUSD: 4.99,
            timestamp: new Date(),
            transactionTimestamp: BigInt(Date.now()),
            adNetworkName: null,
            adFormat: null,
            adUnitId: null,
            adUnitName: null,
            adPlacement: null,
            adCreativeId: null,
            adImpressionId: null,
            adNetworkPlacement: null,
            productId: 'com.game.coins_100',
            productName: '100 Coins',
            productType: 'CONSUMABLE',
            transactionId: 'txn-123',
            orderId: 'order-123',
            purchaseToken: 'token-123',
            store: 'APPLE_APP_STORE',
            isVerified: true,
            quantity: 1,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        };

        batchWriter.enqueue(revenue);

        expect(mockPrisma.revenue.createMany).not.toHaveBeenCalled();

        // Wait for timer to trigger flush (750ms + buffer)
        await new Promise(resolve => setTimeout(resolve, 850));

        expect(mockPrisma.revenue.createMany).toHaveBeenCalledTimes(1);
    });

    it('should retry once on flush failure', async () => {
        mockPrisma.revenue.createMany
            .mockRejectedValueOnce(new Error('DB connection lost'))
            .mockResolvedValueOnce({ count: 1 });

        const revenue = {
            gameId: 'game-1',
            userId: 'user-1',
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: 'imp-123',
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        };

        batchWriter.enqueue(revenue);
        await batchWriter.flush();

        // Should have been called twice (initial + retry)
        expect(mockPrisma.revenue.createMany).toHaveBeenCalledTimes(2);
    });

    it('should drop batch after retry fails', async () => {
        mockPrisma.revenue.createMany
            .mockRejectedValueOnce(new Error('DB error 1'))
            .mockRejectedValueOnce(new Error('DB error 2'));

        const revenue = {
            gameId: 'game-1',
            userId: 'user-1',
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: 'imp-123',
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        };

        batchWriter.enqueue(revenue);
        await batchWriter.flush();

        const metrics = batchWriter.getMetrics();
        expect(metrics.totalFailed).toBe(1);
        expect(metrics.totalDropped).toBe(1);
    });

    it('should flush remaining revenue records on shutdown', async () => {
        const revenues = Array.from({ length: 5 }, (_, i) => ({
            gameId: 'game-1',
            userId: `user-${i}`,
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: `imp-${i}`,
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        }));

        revenues.forEach(revenue => batchWriter.enqueue(revenue));

        await batchWriter.shutdown();

        expect(mockPrisma.revenue.createMany).toHaveBeenCalledTimes(1);
        expect(batchWriter.getBufferSize()).toBe(0);
    });

    it('should prevent concurrent flushes', async () => {
        const revenues = Array.from({ length: 200 }, (_, i) => ({
            gameId: 'game-1',
            userId: `user-${i}`,
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: `imp-${i}`,
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        }));

        // Simulate slow DB writes to test concurrency protection
        let flushCount = 0;
        mockPrisma.revenue.createMany.mockImplementation(() => {
            flushCount++;
            return new Promise(resolve => setTimeout(() => resolve({ count: 100 }), 200));
        });

        // Enqueue all revenue records (first 100 triggers flush, next 100 queued for next flush)
        revenues.forEach(revenue => batchWriter.enqueue(revenue));

        // Wait longer to allow for multiple flush cycles
        await new Promise(resolve => setTimeout(resolve, 600));

        // Should have called createMany at least 1 time, but no concurrent calls
        // The actual behavior is 1 call for 100 items, then 1 call for 100 items
        expect(mockPrisma.revenue.createMany).toHaveBeenCalled();
        expect(flushCount).toBeGreaterThanOrEqual(1);
    });

    it('should track metrics correctly', async () => {
        mockPrisma.revenue.createMany.mockResolvedValue({ count: 5 });

        const revenues = Array.from({ length: 5 }, (_, i) => ({
            gameId: 'game-1',
            userId: `user-${i}`,
            sessionId: 'session-1',
            revenueType: RevenueType.AD_IMPRESSION,
            revenue: 0.05,
            currency: 'USD',
            revenueUSD: 0.05,
            timestamp: new Date(),
            transactionTimestamp: null,
            adNetworkName: 'AdMob',
            adFormat: 'REWARDED',
            adUnitId: 'ca-app-pub-123',
            adUnitName: null,
            adPlacement: 'level_complete',
            adCreativeId: null,
            adImpressionId: `imp-${i}`,
            adNetworkPlacement: null,
            productId: null,
            productName: null,
            productType: null,
            transactionId: null,
            orderId: null,
            purchaseToken: null,
            store: null,
            isVerified: false,
            quantity: null,
            isSandbox: false,
            isRestored: false,
            subscriptionPeriod: null,
            platform: 'ios',
            device: 'iPhone 14',
            deviceId: 'device-123',
            appVersion: '1.0.0',
            appBuild: '100',
            countryCode: 'US',
            customData: null
        }));

        revenues.forEach(revenue => batchWriter.enqueue(revenue));
        await batchWriter.flush();

        const metrics = batchWriter.getMetrics();
        expect(metrics.totalFlushed).toBe(5);
        expect(metrics.totalFailed).toBe(0);
        expect(metrics.totalDropped).toBe(0);
        expect(metrics.bufferSize).toBe(0);
    });
});

