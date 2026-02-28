/**
 * API Types for LvlUp Backend
 */

// Common API response type
export interface ApiResponse {
    success: boolean;
    data?: any;
    summary?: any;
    error?: string;
    code?: string;
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

// Single event data - matches Prisma Event model
export interface EventData {
    eventName: string;
    properties?: Record<string, any>;
    timestamp?: string;
    
    // Event metadata
    eventUuid?: string;     // Unique event identifier from client
    clientTs?: number;      // Client-side Unix timestamp
    
    // Device & Platform info
    platform?: string;      // e.g., "android", "ios", "webgl"
    osVersion?: string;     // e.g., "android 13", "iOS 16.0"
    manufacturer?: string;  // e.g., "TECNO", "Apple"
    device?: string;        // e.g., "TECNO BG6", "iPhone 14"
    deviceId?: string;      // Unique device identifier
    
    // App info
    appVersion?: string;    // e.g., "0.0.3"
    appBuild?: string;      // e.g., "30087"
    sdkVersion?: string;    // e.g., "unity 1.0.0"
    
    // Network & Additional
    connectionType?: string; // e.g., "wifi", "wwan", "offline"
    sessionNum?: number;     // Session number for this user
    
    // Geographic location (minimal)
    countryCode?: string;    // ISO 3166-1 alpha-2, e.g., "US"
    
    // Level funnel tracking (for AB testing level designs)
    levelFunnel?: string;    // e.g., "live_0.0.1", "test_variant_a"
    levelFunnelVersion?: number; // e.g., 59, 60
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
    sdkVersion?: string;     // e.g., "unity 1.0.0"
    
    // Network
    connectionType?: string; // e.g., "wifi", "wwan", "offline"
    
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
    version?: string;      // Legacy field
    appVersion?: string;   // Primary field from SDK (same as events)
    countryCode?: string;  // ISO country code (e.g., "MX", "US", "TR")
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

// Analytics response types
export interface TopEventData {
    name: string;
    count: number;
}

export interface AnalyticsData {
    totalUsers: number;
    totalActiveUsers: number;
    newUsers: number;
    totalSessions: number;
    totalEvents: number;
    avgSessionDuration: number;
    avgSessionsPerUser: number;
    avgPlaytimeDuration: number;
    retentionDay1: number;
    retentionDay7: number;
    activeUsersToday: number;
    topEvent: string;
    topEvents: TopEventData[];
}

// ============================================================================
// Remote Config API Types
// ============================================================================

import type {
    ConfigDataType,
    ConfigEnvironment,
    Platform,
    VersionOperator,
    SegmentType,
    ValidationRuleType,
} from './config.types';

/**
 * Platform condition with version range
 */
export interface PlatformCondition {
    platform: string; // "iOS", "Android", "Web"
    minVersion?: string; // Minimum version (inclusive), e.g., "1.0.0"
    maxVersion?: string; // Maximum version (inclusive), e.g., "2.0.0"
}

/**
 * POST /api/admin/configs - Create config request
 */
export interface CreateConfigRequest {
    gameId: string;
    key: string;
    value: unknown;
    dataType: ConfigDataType;
    environment: ConfigEnvironment;
    enabled?: boolean;
    description?: string;
    validationRules?: Array<{
        ruleType: ValidationRuleType;
        ruleValue: string;
    }>;
}

/**
 * POST /api/admin/configs - Create config response
 */
export interface CreateConfigResponse {
    success: boolean;
    data: {
        id: string;
        gameId: string;
        key: string;
        value: unknown;
        dataType: ConfigDataType;
        environment: ConfigEnvironment;
        enabled: boolean;
        description: string | null;
        createdAt: string;
        updatedAt: string;
    };
}

/**
 * PUT /api/admin/configs/:id - Update config request
 */
export interface UpdateConfigRequest {
    value?: unknown;
    enabled?: boolean;
    description?: string;
    validationRules?: Array<{
        ruleType: ValidationRuleType;
        ruleValue: string;
    }>;
}

/**
 * PUT /api/admin/configs/:id - Update config response
 */
export interface UpdateConfigResponse {
    success: boolean;
    data: {
        id: string;
        gameId: string;
        key: string;
        value: unknown;
        dataType: ConfigDataType;
        environment: ConfigEnvironment;
        enabled: boolean;
        description: string | null;
        createdAt: string;
        updatedAt: string;
    };
}

/**
 * GET /api/admin/configs/:gameId - List configs response
 */
export interface ListConfigsResponse {
    success: boolean;
    data: {
        configs: Array<{
            id: string;
            gameId: string;
            key: string;
            value: unknown;
            dataType: ConfigDataType;
            environment: ConfigEnvironment;
            enabled: boolean;
            description: string | null;
            createdAt: string;
            updatedAt: string;
            rulesCount?: number;
        }>;
        total: number;
    };
}

/**
 * DELETE /api/admin/configs/:id - Delete config response
 */
export interface DeleteConfigResponse {
    success: boolean;
    message: string;
}

/**
 * POST /api/admin/configs/:configId/rules - Create rule request
 */
export interface CreateRuleRequest {
    priority: number;
    enabled?: boolean;
    overrideValue: unknown;
    platformConditions?: PlatformCondition[]; // Array of platforms with version ranges
    countryConditions?: string[]; // Array of country codes
    segmentConditions?: SegmentType[]; // Array of segment types
    activeBetweenStart?: string; // ISO timestamp
    activeBetweenEnd?: string; // ISO timestamp
}

/**
 * POST /api/admin/configs/:configId/rules - Create rule response
 */
export interface CreateRuleResponse {
    success: boolean;
    data: {
        id: string;
        configId: string;
        priority: number;
        enabled: boolean;
        overrideValue: unknown;
        platformConditions: PlatformCondition[] | null; // Array of platforms with version ranges
        countryConditions: string[] | null; // Array of country codes
        segmentConditions: SegmentType[] | null; // Array of segment types
        activeBetweenStart: string | null;
        activeBetweenEnd: string | null;
        createdAt: string;
        updatedAt: string;
    };
}

/**
 * PUT /api/admin/configs/:configId/rules/:ruleId - Update rule request
 */
export interface UpdateRuleRequest {
    priority?: number;
    enabled?: boolean;
    overrideValue?: unknown;
    platformConditions?: PlatformCondition[] | null; // Array of platforms with version ranges
    countryConditions?: string[] | null; // Array of country codes
    segmentConditions?: SegmentType[] | null; // Array of segment types
    activeBetweenStart?: string | null; // ISO timestamp
    activeBetweenEnd?: string | null; // ISO timestamp
}

/**
 * PUT /api/admin/configs/:configId/rules/:ruleId - Update rule response
 */
export interface UpdateRuleResponse {
    success: boolean;
    data: {
        id: string;
        configId: string;
        priority: number;
        enabled: boolean;
        overrideValue: unknown;
        platformConditions: PlatformCondition[] | null; // Array of platforms with version ranges
        countryConditions: string[] | null; // Array of country codes
        segmentConditions: SegmentType[] | null; // Array of segment types
        activeBetweenStart: string | null;
        activeBetweenEnd: string | null;
        createdAt: string;
        updatedAt: string;
    };
}

/**
 * DELETE /api/admin/configs/:configId/rules/:ruleId - Delete rule response
 */
export interface DeleteRuleResponse {
    success: boolean;
    message: string;
}

/**
 * PUT /api/admin/configs/:configId/rules/reorder - Reorder rules request
 */
export interface ReorderRulesRequest {
    ruleOrder: Array<{
        ruleId: string;
        newPriority: number;
    }>;
}

/**
 * PUT /api/admin/configs/:configId/rules/reorder - Reorder rules response
 */
export interface ReorderRulesResponse {
    success: boolean;
    data: {
        updatedRules: Array<{
            id: string;
            priority: number;
        }>;
    };
}

/**
 * GET /api/configs/:gameId - Public config fetch request query params
 */
export interface FetchConfigsQueryParams {
    environment?: ConfigEnvironment;
    platform?: Platform;
    version?: string;
    country?: string;
    segment?: SegmentType;
    debug?: 'true' | 'false';
}

/**
 * GET /api/configs/:gameId - Public config fetch response
 */
export interface FetchConfigsResponse {
    success: boolean;
    data: {
        configs: Record<string, unknown>; // key -> evaluated value
        metadata: {
            gameId: string;
            environment: ConfigEnvironment;
            fetchedAt: string; // ISO timestamp
            cacheUntil: string; // ISO timestamp (5 min from fetch)
            totalConfigs: number;
        };
        debug?: {
            evaluations: Array<{
                key: string;
                value: unknown;
                dataType: ConfigDataType;
                source: 'default' | 'rule' | 'ab_test';
                matchedRuleId?: string;
                matchedRulePriority?: number;
            }>;
            context: {
                platform?: Platform;
                version?: string;
                country?: string;
                segment?: SegmentType;
                serverTime: string;
            };
        };
    };
}

/**
 * GET /api/admin/configs/:configId/history - Config history response
 */
export interface ConfigHistoryResponse {
    success: boolean;
    data: {
        history: Array<{
            id: string;
            configId: string;
            changeType: string;
            previousValue: unknown | null;
            newValue: unknown;
            changedBy: string;
            changedAt: string;
        }>;
        total: number;
    };
}

/**
 * GET /api/admin/configs/:configId/rules/:ruleId/history - Rule history response
 */
export interface RuleHistoryResponse {
    success: boolean;
    data: {
        history: Array<{
            id: string;
            ruleId: string | null;
            configId: string;
            action: string;
            previousState: unknown | null;
            newState: unknown | null;
            changedBy: string;
            changedAt: string;
        }>;
        total: number;
    };
}
