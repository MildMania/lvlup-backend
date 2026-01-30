/**
 * Revenue & Monetization Types
 * Unified types for Ad Impressions and In-App Purchases
 */

export enum RevenueType {
    AD_IMPRESSION = 'AD_IMPRESSION',
    IN_APP_PURCHASE = 'IN_APP_PURCHASE'
}

// Base revenue data shared by both ad impressions and IAP
export interface BaseRevenueData {
    revenue: number;
    currency?: string; // Defaults to USD
    
    // Timing
    timestamp?: string;
    transactionTimestamp?: number;
    
    // Context (optional - will be populated from event metadata if not provided)
    platform?: string;
    appVersion?: string;
    appBuild?: string;
    countryCode?: string; // ISO 3166-1 alpha-2 (e.g., "US", "TR")
    device?: string;
    deviceId?: string;
    
    // Custom data (flexible payload for additional fields)
    customData?: Record<string, any>;
}

// Ad Impression specific data
export interface AdImpressionData extends BaseRevenueData {
    revenueType: RevenueType.AD_IMPRESSION;
    
    // Required ad fields
    adNetworkName: string; // "MAX", "AdMob", "IronSource", "Unity Ads"
    adFormat: string; // "BANNER", "INTER", "REWARDED", "MREC", "APPOPEN"
    
    // Optional ad fields
    adUnitId?: string;
    adUnitName?: string;
    adPlacement?: string;
    adCreativeId?: string;
    adImpressionId?: string; // For deduplication
    adNetworkPlacement?: string;
    
    // Additional data
    metadata?: Record<string, any>;
}

// In-App Purchase specific data
export interface InAppPurchaseData extends BaseRevenueData {
    revenueType: RevenueType.IN_APP_PURCHASE;
    
    // Required IAP fields
    productId: string; // "com.game.coins_100"
    store: string; // "APPLE_APP_STORE", "GOOGLE_PLAY", "AMAZON"
    transactionId: string; // Unique transaction ID for deduplication
    
    // Optional IAP fields
    productName?: string;
    productType?: string; // "CONSUMABLE", "NON_CONSUMABLE", "SUBSCRIPTION"
    orderId?: string;
    purchaseToken?: string;
    quantity?: number;
    isVerified?: boolean;
    isSandbox?: boolean;
    isRestored?: boolean;
    subscriptionPeriod?: string;
    
    // Additional data
    metadata?: Record<string, any>;
}

// Union type for revenue data
export type RevenueData = AdImpressionData | InAppPurchaseData;

// Revenue tracking request (from SDK)
export interface TrackRevenueRequest {
    userId: string;
    sessionId?: string;
    revenueData: RevenueData;
}

// Revenue analytics response types
export interface RevenueAnalytics {
    totalRevenue: number;
    adRevenue: number;
    iapRevenue: number;
    currency: string;
    
    // Breakdowns
    byNetwork?: { network: string; revenue: number; impressions: number }[];
    byFormat?: { format: string; revenue: number; impressions: number }[];
    byProduct?: { product: string; revenue: number; purchases: number }[];
    byCountry?: { country: string; revenue: number }[];
}

// ARPU / LTV metrics
export interface MonetizationMetrics {
    arpu: number; // Average Revenue Per User
    arppu: number; // Average Revenue Per Paying User
    payingUserRate: number; // Percentage of users who spent money
    avgTransactionValue: number;
    totalUsers: number;
    payingUsers: number;
}

