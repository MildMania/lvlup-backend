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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}
