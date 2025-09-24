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
}

// Batch event data
export interface BatchEventData {
    userId: string;
    sessionId?: string;
    events: EventData[];
    deviceInfo?: {
        platform?: string;
        version?: string;
        deviceId?: string;
    };
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