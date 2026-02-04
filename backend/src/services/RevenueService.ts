 import { PrismaClient } from '@prisma/client';
import { RevenueData, RevenueType, RevenueAnalytics, MonetizationMetrics } from '../types/revenue';
import logger from '../utils/logger';
import prisma from '../prisma';
import { convertToUSD } from '../utils/currencyConverter';
import { revenueBatchWriter } from './RevenueBatchWriter';
import { createHash } from 'crypto';

export class RevenueService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    /**
     * Track revenue event (Ad Impression or In-App Purchase)
     * Uses batch writer to optimize database writes
     */
    async trackRevenue(
        gameId: string,
        userId: string,
        sessionId: string | null,
        revenueData: RevenueData,
        eventMetadata?: any // Device, platform, geo data from event
    ) {
        try {
            const timestamp = revenueData.timestamp ? new Date(revenueData.timestamp) : new Date();
            const currency = revenueData.currency || 'USD';
            
            // Use revenueUSD from SDK if provided (and valid), otherwise convert it
            let revenueUSD: number;
            if (revenueData.revenueUSD && revenueData.revenueUSD > 0) {
                // SDK already converted it, use the provided value
                revenueUSD = revenueData.revenueUSD;
                logger.debug(`Using pre-converted revenueUSD: ${revenueUSD} USD`);
            } else {
                // Backend converts the revenue to USD
                revenueUSD = convertToUSD(revenueData.revenue, currency);
                logger.debug(`Backend converted ${revenueData.revenue} ${currency} to ${revenueUSD} USD`);
            }
            
            // Prepare common revenue fields
            const revenueRecord: any = {
                gameId,
                userId,
                sessionId,
                revenueType: revenueData.revenueType,
                revenue: revenueData.revenue,
                currency: currency,
                revenueUSD: revenueUSD, // Store USD-converted value
                timestamp,
                serverReceivedAt: new Date(),
                transactionTimestamp: revenueData.transactionTimestamp ? BigInt(revenueData.transactionTimestamp) : null,
                
                // Device & App context
                platform: revenueData.platform || eventMetadata?.platform || null,
                device: revenueData.device || null,
                deviceId: revenueData.deviceId || null,
                appVersion: revenueData.appVersion || eventMetadata?.appVersion || null,
                appBuild: revenueData.appBuild || eventMetadata?.appBuild || null,
                countryCode: revenueData.countryCode || eventMetadata?.countryCode || null,
                
                // Custom data
                customData: revenueData.customData || null,
                
                // Initialize all optional fields to null by default
                adNetworkName: null,
                adFormat: null,
                adUnitId: null,
                adUnitName: null,
                adPlacement: null,
                adCreativeId: null,
                adImpressionId: null,
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
            };

            // Add type-specific fields
            if (revenueData.revenueType === RevenueType.AD_IMPRESSION) {
                // Generate deterministic adImpressionId using hash of transaction data
                // Same data = same hash, so retries will have identical IDs
                const adImpressionId = revenueData.adImpressionId || (() => {
                    const hashData = JSON.stringify({
                        userId,
                        gameId,
                        adNetworkName: revenueData.adNetworkName,
                        adFormat: revenueData.adFormat,
                        adPlacement: revenueData.adPlacement,
                        timestamp: revenueData.timestamp,
                        revenue: revenueData.revenue,
                    });
                    const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 16);
                    return `ad_${hash}`;
                })();
                
                Object.assign(revenueRecord, {
                    adNetworkName: revenueData.adNetworkName || null,
                    adFormat: revenueData.adFormat || null,
                    adUnitId: revenueData.adUnitId || null,
                    adUnitName: revenueData.adUnitName || null,
                    adPlacement: revenueData.adPlacement || null,
                    adCreativeId: revenueData.adCreativeId || null,
                    adImpressionId: adImpressionId,  // Deterministic hash
                    adNetworkPlacement: revenueData.adNetworkPlacement || null,
                });
                
                logger.info(`Ad impression enqueued: ${revenueData.adNetworkName} ${revenueData.adFormat} - $${revenueData.revenue} - ad: ${adImpressionId}`);
            } else if (revenueData.revenueType === RevenueType.IN_APP_PURCHASE) {
                // Generate deterministic transactionId using hash of purchase data
                // Same purchase data = same hash, so retries will have identical IDs
                const transactionId = revenueData.transactionId || (() => {
                    const hashData = JSON.stringify({
                        userId,
                        gameId,
                        productId: revenueData.productId,
                        store: revenueData.store,
                        revenue: revenueData.revenue,
                        timestamp: revenueData.timestamp,
                    });
                    const hash = createHash('sha256').update(hashData).digest('hex').substring(0, 16);
                    return `txn_${hash}`;
                })();
                
                Object.assign(revenueRecord, {
                    productId: revenueData.productId || null,
                    productName: revenueData.productName || null,
                    productType: revenueData.productType || null,
                    transactionId: transactionId,  // Deterministic hash
                    orderId: revenueData.orderId || null,
                    purchaseToken: revenueData.purchaseToken || null,
                    store: revenueData.store || null,
                    isVerified: revenueData.isVerified || false,
                    quantity: revenueData.quantity || 1,
                    isSandbox: revenueData.isSandbox || false,
                    isRestored: revenueData.isRestored || false,
                    subscriptionPeriod: revenueData.subscriptionPeriod || null,
                });
                
                logger.info(`IAP enqueued: ${revenueData.productId} - $${revenueData.revenue} (${revenueData.store}) - txn: ${transactionId}`);
            }

            // Enqueue revenue record for batched insertion (non-blocking)
            revenueBatchWriter.enqueue(revenueRecord);
            
            // Return the revenue record (note: not yet persisted, but will be within ~750ms)
            return revenueRecord;
        } catch (error) {
            logger.error('Error tracking revenue:', error);
            throw error;
        }
    }

    /**
     * Get revenue analytics for a date range
     */
    async getRevenueAnalytics(
        gameId: string,
        startDate: Date,
        endDate: Date
    ): Promise<RevenueAnalytics> {
        try {
            // Get total revenue by type (use revenueUSD for aggregation)
            const revenueByType = await this.prisma.revenue.groupBy({
                by: ['revenueType'],
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenueUSD: true },
                _count: true
            });

            let totalRevenue = 0;
            let adRevenue = 0;
            let iapRevenue = 0;

            revenueByType.forEach(item => {
                const revenue = Number(item._sum.revenueUSD || 0);
                totalRevenue += revenue;
                
                if (item.revenueType === 'AD_IMPRESSION') {
                    adRevenue = revenue;
                } else if (item.revenueType === 'IN_APP_PURCHASE') {
                    iapRevenue = revenue;
                }
            });

            // Get ad revenue by network (use revenueUSD)
            const byNetwork = await this.prisma.revenue.groupBy({
                by: ['adNetworkName'],
                where: {
                    gameId,
                    revenueType: 'AD_IMPRESSION',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenueUSD: true },
                _count: true
            });

            // Get ad revenue by format (use revenueUSD)
            const byFormat = await this.prisma.revenue.groupBy({
                by: ['adFormat'],
                where: {
                    gameId,
                    revenueType: 'AD_IMPRESSION',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenueUSD: true },
                _count: true
            });

            // Get IAP revenue by product (use revenueUSD)
            const byProduct = await this.prisma.revenue.groupBy({
                by: ['productId'],
                where: {
                    gameId,
                    revenueType: 'IN_APP_PURCHASE',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenueUSD: true },
                _count: true
            });

            // Get revenue by country (top 10) (use revenueUSD)
            const byCountry = await this.prisma.revenue.groupBy({
                by: ['countryCode'],
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate },
                    countryCode: { not: null }
                },
                _sum: { revenueUSD: true },
                orderBy: { _sum: { revenueUSD: 'desc' } },
                take: 10
            });

            return {
                totalRevenue,
                adRevenue,
                iapRevenue,
                currency: 'USD', // All values are in USD after conversion
                byNetwork: byNetwork.map(item => ({
                    network: item.adNetworkName || 'Unknown',
                    revenue: Number(item._sum.revenueUSD || 0),
                    impressions: item._count
                })),
                byFormat: byFormat.map(item => ({
                    format: item.adFormat || 'Unknown',
                    revenue: Number(item._sum.revenueUSD || 0),
                    impressions: item._count
                })),
                byProduct: byProduct.map(item => ({
                    product: item.productId || 'Unknown',
                    revenue: Number(item._sum.revenueUSD || 0),
                    purchases: item._count
                })),
                byCountry: byCountry.map(item => ({
                    country: item.countryCode || 'Unknown',
                    revenue: Number(item._sum.revenueUSD || 0)
                }))
            };
        } catch (error) {
            logger.error('Error getting revenue analytics:', error);
            throw error;
        }
    }

    /**
     * Get monetization metrics (ARPU, ARPPU, etc.)
     */
    async getMonetizationMetrics(
        gameId: string,
        startDate: Date,
        endDate: Date
    ): Promise<MonetizationMetrics> {
        try {
            // Get total users in period
            const totalUsers = await this.prisma.user.count({
                where: {
                    gameId,
                    createdAt: { lte: endDate }
                }
            });

            // Get users who generated revenue
            const payingUsersResult = await this.prisma.revenue.groupBy({
                by: ['userId'],
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate }
                }
            });
            const payingUsers = payingUsersResult.length;

            // Get total revenue and count (use revenueUSD)
            const revenueStats = await this.prisma.revenue.aggregate({
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenueUSD: true },
                _count: true
            });

            const totalRevenue = Number(revenueStats._sum.revenueUSD || 0);
            const transactionCount = revenueStats._count;

            return {
                arpu: totalUsers > 0 ? totalRevenue / totalUsers : 0,
                arppu: payingUsers > 0 ? totalRevenue / payingUsers : 0,
                payingUserRate: totalUsers > 0 ? (payingUsers / totalUsers) * 100 : 0,
                avgTransactionValue: transactionCount > 0 ? totalRevenue / transactionCount : 0,
                totalUsers,
                payingUsers
            };
        } catch (error) {
            logger.error('Error getting monetization metrics:', error);
            throw error;
        }
    }
}

