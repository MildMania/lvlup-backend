import { validatePlannerOutput } from '../src/ai/validation';
import { PlannerOutput } from '../src/ai/types';

const cases: Array<{ name: string; query: string; plan: PlannerOutput }> = [
  {
    name: 'Revenue trend + attribution',
    query: 'Fetch the daily revenue for Galaxy Quest for the last 30 days. Is there a specific country driving the decline?',
    plan: {
      game: 'Galaxy Quest',
      metric: 'revenue',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 30 },
      breakdowns: ['country'],
      comparison: { type: 'previous_period' },
      analysis: ['trend', 'top_contributors'],
      filters: [],
      response_mode: 'short'
    }
  },
  {
    name: 'Retention by country',
    query: 'Show d7 retention by country for Galaxy Quest in the last 14 days',
    plan: {
      game: 'Galaxy Quest',
      metric: 'd7_retention',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 14 },
      breakdowns: ['country'],
      comparison: { type: 'none' },
      analysis: ['trend', 'top_contributors'],
      filters: [],
      response_mode: 'short'
    }
  },
  {
    name: 'ARPDAU by platform',
    query: 'ARPDAU by platform for the last 30 days',
    plan: {
      game: 'Unknown',
      metric: 'arpdau',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 30 },
      breakdowns: [],
      comparison: { type: 'none' },
      analysis: ['trend'],
      filters: [],
      response_mode: 'deep'
    }
  },
  {
    name: 'Compare last 7 days vs previous 7 days',
    query: 'Compare revenue for Galaxy Quest last 7 days vs previous 7 days',
    plan: {
      game: 'Galaxy Quest',
      metric: 'revenue',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 7 },
      breakdowns: [],
      comparison: { type: 'previous_period' },
      analysis: ['trend'],
      filters: [],
      response_mode: 'short'
    }
  },
  {
    name: 'Ambiguous game name handling',
    query: 'Show revenue for Galaxy',
    plan: {
      game: 'Galaxy',
      metric: 'revenue',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 7 },
      breakdowns: [],
      comparison: { type: 'none' },
      analysis: ['trend'],
      filters: [],
      response_mode: 'deep'
    }
  },
  {
    name: 'Unsupported metric request handling (mapped before validation)',
    query: 'Show LTV for Galaxy Quest last 30 days',
    plan: {
      game: 'Galaxy Quest',
      metric: 'revenue',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 30 },
      breakdowns: [],
      comparison: { type: 'none' },
      analysis: ['trend'],
      filters: [{ field: '_warning', op: '=', value: 'unsupported_metric_requested' }],
      response_mode: 'short'
    }
  },
  {
    name: 'DAU weekly granularity',
    query: 'Weekly DAU for Galaxy Quest over last 8 weeks',
    plan: {
      game: 'Galaxy Quest',
      metric: 'dau',
      granularity: 'week',
      time_range: { type: 'last_n_days', n: 56 },
      breakdowns: [],
      comparison: { type: 'none' },
      analysis: ['trend'],
      filters: [],
      response_mode: 'short'
    }
  },
  {
    name: 'Installs trend',
    query: 'Installs trend for Galaxy Quest last 30 days',
    plan: {
      game: 'Galaxy Quest',
      metric: 'installs',
      granularity: 'day',
      time_range: { type: 'last_n_days', n: 30 },
      breakdowns: [],
      comparison: { type: 'none' },
      analysis: ['trend'],
      filters: [],
      response_mode: 'short'
    }
  }
];

describe('AI analytics planner output validation', () => {
  test.each(cases)('$name', ({ plan }) => {
    expect(() => validatePlannerOutput(plan)).not.toThrow();
  });
});
