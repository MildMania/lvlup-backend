import apiClient from '../lib/apiClient';
import type {
  RetentionPoint,
  ActiveUserPoint,
  PlaytimePoint,
  ApiResponse,
} from '../types/analytics';

const RETENTION_PATH = 'analytics/enhanced/metrics/retention';
const ACTIVE_USERS_PATH = 'analytics/enhanced/metrics/active-users';
const PLAYTIME_PATH = 'analytics/enhanced/metrics/playtime';

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
