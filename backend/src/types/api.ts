/**
 * API Types for LvlUp Backend
 */

// Common API response type
export interface ApiResponse {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

// Analytics filter parameters
export interface AnalyticsFilterParams {
    startDate?: string;
    endDate?: string;
    country?: string | string[];
    platform?: string | string[];
    version?: string | string[];
    retentionDays?: number[];
}

// User profile data
export interface UserProfile {
    externalId: string;
    deviceId?: string;
    platform?: string;
    version?: string;
    country?: string;
    language?: string;
}

// Single event data
export interface EventData {
    eventName: string;
    properties?: Record<string, any>;
    timestamp?: string;
    eventUuid?: string;    // Unique event identifier
    clientTs?: number;      // Client Unix timestamp
}

// Device and system information (like GameAnalytics)
export interface DeviceInfo {
    // Core identifiers
    deviceId?: string;
    sessionId?: string;
    sessionNum?: number;
    
    // Platform info
    platform?: string;       // e.g., "android", "ios", "webgl"
    osVersion?: string;      // e.g., "android 13", "iOS 16.0"
    manufacturer?: string;   // e.g., "TECNO", "Apple"
    device?: string;         // e.g., "TECNO BG6", "iPhone 14"
    
    // App info
    appVersion?: string;     // e.g., "0.0.3"
    appBuild?: string;       // e.g., "30087"
    bundleId?: string;       // e.g., "com.mildmania.packperfect"
    engineVersion?: string;  // e.g., "unity 2022.3.62"
    sdkVersion?: string;     // e.g., "unity 1.0.0"
    
    // Network
    connectionType?: string; // e.g., "wifi", "wwan", "offline"
    
    // Additional metadata
    appSignature?: string;   // Android app signature
    channelId?: string;      // e.g., "com.android.vending"
    
    // Legacy compatibility
    version?: string;
}

// Batch event data
export interface BatchEventData {
    userId: string;
    sessionId?: string;
    events: EventData[];
    deviceInfo?: DeviceInfo;
}

// Session data
export interface SessionData {
    startTime: string;
    platform?: string;
    version?: string;
}

// Remote config request
export interface ConfigRequest {
    key: string;
    value: any;
    enabled?: boolean;
    description?: string;
    tags?: string[];
    conditions?: Record<string, any>;
}

// Authenticated request extension
export interface AuthPayload {
    gameId: string;
    apiKey: string;
}