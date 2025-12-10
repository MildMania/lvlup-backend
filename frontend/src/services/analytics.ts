import apiClient from '../lib/apiClient';
import type {
  RetentionPoint,
  ActiveUserPoint,
  PlaytimePoint,
  ApiResponse,
  UserAnalytics,
  RetentionData,
  EngagementData,
  PlayerJourneyData,
  EventData,
  PlatformData,
  CountryData,
  DashboardSummary,
} from '../types/analytics';

// API endpoints
const RETENTION_PATH = 'analytics/metrics/retention';
const ACTIVE_USERS_PATH = 'analytics/metrics/active-users';
const PLAYTIME_PATH = 'analytics/metrics/playtime';

export const fetchRetention = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<RetentionPoint[]>>(
    RETENTION_PATH,
    { params }
  );
  return response.data.data;
};

export const fetchActiveUsers = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<ActiveUserPoint[]>>(
    ACTIVE_USERS_PATH,
    { params }
  );
  return response.data.data;
};

export const fetchPlaytime = async (params: URLSearchParams) => {
  const response = await apiClient.get<ApiResponse<PlaytimePoint[]>>(
    PLAYTIME_PATH,
    { params }
  );
  return response.data.data;
};

// Enhanced Analytics Service
export class AnalyticsService {
  // Dashboard Overview
  static async getDashboardSummary(startDate?: string, endDate?: string): Promise<DashboardSummary> {
    try {
      const params = startDate && endDate ? { startDate, endDate } : {};
      const response = await apiClient.get<ApiResponse<DashboardSummary>>('/analytics/dashboard', {
        params
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
      params: { startDate, endDate }
    });
    return response.data.data;
  }

  static async getActiveUsers(startDate: string, endDate: string): Promise<ActiveUserPoint[]> {
    const response = await apiClient.get<ApiResponse<ActiveUserPoint[]>>('/analytics/metrics/active-users', {
      params: { startDate, endDate }
    });
    return response.data.data;
  }

  // Retention Analysis
  static async getRetentionCohorts(startDate: string, endDate: string): Promise<RetentionData[]> {
    const response = await apiClient.get<ApiResponse<RetentionData[]>>('/analytics/metrics/retention', {
      params: { startDate, endDate }
    });
    return response.data.data;
  }

  // Player Journey
  static async getPlayerJourney(startDate?: string, endDate?: string): Promise<PlayerJourneyData[]> {
    const params = startDate && endDate ? { startDate, endDate } : {};
    const response = await apiClient.get<ApiResponse<PlayerJourneyData[]>>('/analytics/player-journey/funnel', {
      params
    });
    return response.data.data;
  }

  // Dashboard retention cohorts for charts
  static async getDashboardRetention(startDate?: string, endDate?: string): Promise<RetentionPoint[]> {
    try {
      const params = startDate && endDate ? { startDate, endDate } : {};
      const response = await apiClient.get<ApiResponse<RetentionPoint[]>>('/analytics/retention/cohorts', {
        params
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
