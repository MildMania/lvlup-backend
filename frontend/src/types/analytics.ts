export interface RetentionPoint {
  day: number;
  count: number;
  percentage: number;
}

export interface ActiveUserPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface PlaytimePoint {
  date: string;
  avgSessionDuration: number;
  totalPlaytime: number;
  sessionsPerUser: number;
}

// Game Management
export interface GameInfo {
  id: string;
  name: string;
  apiKey: string;
  description?: string;
}

// User Analytics
export interface UserAnalytics {
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  period: 'day' | 'week' | 'month';
}

// Retention Analysis
export interface RetentionData {
  cohortDate: string;
  cohortSize: number;
  day1: number;
  day3: number;
  day7: number;
  day14: number;
  day30: number;
}

// Engagement Metrics
export interface EngagementData {
  date: string;
  sessions: number;
  avgSessionDuration: number;
  totalUsers: number;
  totalPlaytime: number;
}

// Player Journey
export interface PlayerJourneyData {
  checkpointName: string;
  totalUsers: number;
  completedUsers: number;
  completionRate: number;
  avgTimeToComplete?: number;
  order?: number;
}

// Event Analysis
export interface EventData {
  eventName: string;
  count: number;
  uniqueUsers: number;
  avgEventsPerUser: number;
}

// Platform Distribution
export interface PlatformData {
  platform: string;
  users: number;
  sessions: number;
  percentage: number;
}

// Geographic Distribution
export interface CountryData {
  country: string;
  users: number;
  percentage: number;
}

// Dashboard Summary
export interface DashboardSummary {
  totalUsers: number;
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
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}
