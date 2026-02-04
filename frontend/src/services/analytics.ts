import apiClient from '../lib/apiClient';
import type {
  RetentionPoint,
  ActiveUserPoint,
  PlaytimePoint,
  ApiResponse,
  UserAnalytics,
  RetentionData,
  DashboardSummary,
} from '../types/analytics';

const DEFAULT_TIMEOUT_MS = 15000;

// API endpoints
const RETENTION_PATH = 'analytics/metrics/retention';
const ACTIVE_USERS_PATH = 'analytics/metrics/active-users';
const PLAYTIME_PATH = 'analytics/metrics/playtime';

export const fetchRetention = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<RetentionPoint[]>>(
    RETENTION_PATH,
    { params, timeout: DEFAULT_TIMEOUT_MS }
  );
  return response.data.data;
};

export const fetchActiveUsers = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<ActiveUserPoint[]>>(
    ACTIVE_USERS_PATH,
    { params, timeout: DEFAULT_TIMEOUT_MS }
  );
  return response.data.data;
};

export const fetchPlaytime = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<PlaytimePoint[]>>(
    PLAYTIME_PATH,
    { params, timeout: DEFAULT_TIMEOUT_MS }
  );
  return response.data.data;
};

// Enhanced Analytics Service
export class AnalyticsService {
  // Dashboard Overview
  static async getDashboardSummary(gameId: string, startDate?: string, endDate?: string): Promise<DashboardSummary> {
    try {
      const params = startDate && endDate
        ? { gameId, startDate, endDate, includeRetention: 'false', includeActiveUsersToday: 'false', includeTopEvents: 'false' }
        : { gameId, includeRetention: 'false', includeActiveUsersToday: 'false', includeTopEvents: 'false' };
      const response = await apiClient.get<ApiResponse<DashboardSummary>>('/analytics/dashboard', {
        params,
        timeout: DEFAULT_TIMEOUT_MS
      });
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch dashboard summary:', error);
      throw error;
    }
  }

  // User Analytics
  static async getUserAnalytics(startDate: string, endDate: string): Promise<UserAnalytics> {
    const response = await apiClient.get<ApiResponse<UserAnalytics>>('/analytics/users', {
      params: { startDate, endDate },
      timeout: DEFAULT_TIMEOUT_MS
    });
    return response.data.data;
  }

  static async getActiveUsers(gameId: string, startDate: string, endDate: string): Promise<ActiveUserPoint[]> {
    const response = await apiClient.get<ApiResponse<ActiveUserPoint[]>>('/analytics/metrics/active-users', {
      params: { gameId, startDate, endDate },
      timeout: DEFAULT_TIMEOUT_MS
    });
    return response.data.data;
  }

  // Retention Analysis
  static async getRetentionCohorts(gameId: string, startDate: string, endDate: string): Promise<RetentionData[]> {
    const response = await apiClient.get<ApiResponse<RetentionData[]>>('/analytics/metrics/retention', {
      params: { gameId, startDate, endDate },
      timeout: DEFAULT_TIMEOUT_MS
    });
    return response.data.data;
  }

  // Dashboard retention cohorts for charts
  static async getDashboardRetention(gameId: string, startDate?: string, endDate?: string): Promise<RetentionPoint[]> {
    try {
      const params = startDate && endDate ? { gameId, startDate, endDate } : { gameId };
      const response = await apiClient.get<ApiResponse<RetentionPoint[]>>('/analytics/retention/cohorts', {
        params,
        timeout: DEFAULT_TIMEOUT_MS
      });
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch dashboard retention data:', error);
      throw error;
    }
  }

  // Utility functions for date handling
  static getDateRange(days: number): { startDate: string; endDate: string } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  static formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
