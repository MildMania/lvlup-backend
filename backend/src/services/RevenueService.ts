import { PrismaClient } from '@prisma/client';
import { RevenueData, RevenueType, RevenueAnalytics, MonetizationMetrics } from '../types/revenue';
import logger from '../utils/logger';
import prisma from '../prisma';

export class RevenueService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    /**
     * Track revenue event (Ad Impression or In-App Purchase)
     * This creates both an Event record and a Revenue record (dual-write pattern)
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
            
            // Prepare common revenue fields
            const revenueRecord = {
                gameId,
                userId,
                sessionId,
                revenueType: revenueData.revenueType,
                revenue: revenueData.revenue,
                currency: revenueData.currency || 'USD',
                timestamp,
                clientTs: revenueData.clientTs ? BigInt(revenueData.clientTs) : null,
                transactionTimestamp: revenueData.transactionTimestamp ? BigInt(revenueData.transactionTimestamp) : null,
                
                // Context from event metadata
                platform: revenueData.platform || eventMetadata?.platform || null,
                osVersion: eventMetadata?.osVersion || null,
                manufacturer: eventMetadata?.manufacturer || null,
                device: eventMetadata?.device || null,
                deviceId: eventMetadata?.deviceId || null,
                appVersion: revenueData.appVersion || eventMetadata?.appVersion || null,
                appBuild: eventMetadata?.appBuild || null,
                bundleId: eventMetadata?.bundleId || null,
                engineVersion: eventMetadata?.engineVersion || null,
                sdkVersion: eventMetadata?.sdkVersion || null,
                country: revenueData.country || eventMetadata?.country || null,
                countryCode: revenueData.countryCode || eventMetadata?.countryCode || null,
                region: eventMetadata?.region || null,
                city: eventMetadata?.city || null,
                connectionType: eventMetadata?.connectionType || null,
            };

            // Add type-specific fields
            if (revenueData.revenueType === RevenueType.AD_IMPRESSION) {
                Object.assign(revenueRecord, {
                    adNetworkName: revenueData.adNetworkName,
                    adFormat: revenueData.adFormat,
                    adUnitId: revenueData.adUnitId || null,
                    adUnitName: revenueData.adUnitName || null,
                    adPlacement: revenueData.adPlacement || null,
                    adCreativeId: revenueData.adCreativeId || null,
                    adImpressionId: revenueData.adImpressionId || null,
                    adNetworkPlacement: revenueData.adNetworkPlacement || null,
                    metadata: revenueData.metadata || null,
                });
                
                logger.info(`Ad impression tracked: ${revenueData.adNetworkName} ${revenueData.adFormat} - $${revenueData.revenue}`);
            } else if (revenueData.revenueType === RevenueType.IN_APP_PURCHASE) {
                Object.assign(revenueRecord, {
                    productId: revenueData.productId,
                    productName: revenueData.productName || null,
                    productType: revenueData.productType || null,
                    transactionId: revenueData.transactionId,
                    orderId: revenueData.orderId || null,
                    purchaseToken: revenueData.purchaseToken || null,
                    store: revenueData.store,
                    isVerified: revenueData.isVerified || false,
                    verifiedAt: revenueData.isVerified ? new Date() : null,
                    quantity: revenueData.quantity || 1,
                    isSandbox: revenueData.isSandbox || false,
                    isRestored: revenueData.isRestored || false,
                    subscriptionPeriod: revenueData.subscriptionPeriod || null,
                    metadata: revenueData.metadata || null,
                });
                
                logger.info(`IAP tracked: ${revenueData.productId} - $${revenueData.revenue} (${revenueData.store})`);
            }

            // Create revenue record
            const revenue = await this.prisma.revenue.create({
                data: revenueRecord as any
            });

            return revenue;
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
            // Get total revenue by type
            const revenueByType = await this.prisma.revenue.groupBy({
                by: ['revenueType'],
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenue: true },
                _count: true
            });

            let totalRevenue = 0;
            let adRevenue = 0;
            let iapRevenue = 0;

            revenueByType.forEach(item => {
                const revenue = Number(item._sum.revenue || 0);
                totalRevenue += revenue;
                
                if (item.revenueType === 'AD_IMPRESSION') {
                    adRevenue = revenue;
                } else if (item.revenueType === 'IN_APP_PURCHASE') {
                    iapRevenue = revenue;
                }
            });

            // Get ad revenue by network
            const byNetwork = await this.prisma.revenue.groupBy({
                by: ['adNetworkName'],
                where: {
                    gameId,
                    revenueType: 'AD_IMPRESSION',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenue: true },
                _count: true
            });

            // Get ad revenue by format
            const byFormat = await this.prisma.revenue.groupBy({
                by: ['adFormat'],
                where: {
                    gameId,
                    revenueType: 'AD_IMPRESSION',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenue: true },
                _count: true
            });

            // Get IAP revenue by product
            const byProduct = await this.prisma.revenue.groupBy({
                by: ['productId'],
                where: {
                    gameId,
                    revenueType: 'IN_APP_PURCHASE',
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenue: true },
                _count: true
            });

            // Get revenue by country (top 10)
            const byCountry = await this.prisma.revenue.groupBy({
                by: ['country'],
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate },
                    country: { not: null }
                },
                _sum: { revenue: true },
                orderBy: { _sum: { revenue: 'desc' } },
                take: 10
            });

            return {
                totalRevenue,
                adRevenue,
                iapRevenue,
                currency: 'USD',
                byNetwork: byNetwork.map(item => ({
                    network: item.adNetworkName || 'Unknown',
                    revenue: Number(item._sum.revenue || 0),
                    impressions: item._count
                })),
                byFormat: byFormat.map(item => ({
                    format: item.adFormat || 'Unknown',
                    revenue: Number(item._sum.revenue || 0),
                    impressions: item._count
                })),
                byProduct: byProduct.map(item => ({
                    product: item.productId || 'Unknown',
                    revenue: Number(item._sum.revenue || 0),
                    purchases: item._count
                })),
                byCountry: byCountry.map(item => ({
                    country: item.country || 'Unknown',
                    revenue: Number(item._sum.revenue || 0)
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

            // Get total revenue and count
            const revenueStats = await this.prisma.revenue.aggregate({
                where: {
                    gameId,
                    timestamp: { gte: startDate, lte: endDate }
                },
                _sum: { revenue: true },
                _count: true
            });

            const totalRevenue = Number(revenueStats._sum.revenue || 0);
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

