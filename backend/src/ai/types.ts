export type Metric =
  | 'revenue'
  | 'dau'
  | 'installs'
  | 'd1_retention'
  | 'd7_retention'
  | 'arpdau';

export type Breakdown = 'country' | 'platform';
export type Granularity = 'day' | 'week';
export type Comparison = 'none' | 'previous_period';

export interface PlannerOutput {
  game: string;
  metric: Metric;
  granularity: Granularity;
  time_range: { type: 'last_n_days'; n: number };
  breakdowns: Breakdown[];
  comparison: { type: Comparison };
  analysis: Array<'trend' | 'top_contributors'>;
  filters: Array<{ field: string; op: string; value: string | number }>;
  response_mode: 'short' | 'deep';
}

export interface ExecutorOutput {
  question: string;
  context: {
    tenant_id: string;
    plan: PlannerOutput;
  };
  summary: Record<string, number | string | null>;
  timeseries: Array<{ date: string; value: number }>;
  breakdown_table: Array<Record<string, string | number>>;
  attribution: Array<Record<string, string | number>>;
  confidence: 'high' | 'medium' | 'low';
  response_mode: 'short' | 'deep';
}

export interface LlmClient {
  completeJson(prompt: string, maxTokens: number): Promise<string>;
  completeText(prompt: string, maxTokens: number): Promise<string>;
}

export interface AnalyticsDataSource {
  fetchMetricTimeseries(params: {
    tenantId: string;
    metric: Metric;
    startDate: Date;
    endDate: Date;
    granularity: Granularity;
    breakdowns: Breakdown[];
  }): Promise<Array<Record<string, string | number>>>;
}
