import { Breakdown, Metric } from './types';

export const ALLOWED_METRICS: Metric[] = [
  'revenue',
  'dau',
  'installs',
  'd1_retention',
  'd7_retention',
  'arpdau'
];

export const ALLOWED_BREAKDOWNS: Breakdown[] = ['country', 'platform'];

export const METRIC_BREAKDOWN_SUPPORT: Record<Metric, Breakdown[]> = {
  revenue: ['country', 'platform'],
  dau: ['country', 'platform'],
  installs: ['country', 'platform'],
  d1_retention: ['country', 'platform'],
  d7_retention: ['country', 'platform'],
  arpdau: []
};

export const ALLOWED_GRANULARITY = ['day', 'week'] as const;
export const ALLOWED_COMPARISONS = ['none', 'previous_period'] as const;
