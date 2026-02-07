import {
  ALLOWED_BREAKDOWNS,
  ALLOWED_COMPARISONS,
  ALLOWED_GRANULARITY,
  ALLOWED_METRICS,
  METRIC_BREAKDOWN_SUPPORT
} from './constants';
import { Breakdown, PlannerOutput } from './types';

const PLAN_KEYS = [
  'game',
  'metric',
  'granularity',
  'time_range',
  'breakdowns',
  'comparison',
  'analysis',
  'filters',
  'response_mode'
];

const TIME_RANGE_KEYS = ['type', 'n'];
const COMPARISON_KEYS = ['type'];
const FILTER_KEYS = ['field', 'op', 'value'];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertNoExtraKeys = (obj: Record<string, unknown>, allowed: string[], label: string) => {
  const keys = Object.keys(obj);
  const extra = keys.filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    throw new Error(`${label} has unknown fields: ${extra.join(', ')}`);
  }
};

const assertString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const assertNumber = (value: unknown, label: string) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
};

export const validatePlannerOutput = (input: unknown): PlannerOutput => {
  if (!isPlainObject(input)) {
    throw new Error('Planner output must be an object');
  }

  assertNoExtraKeys(input, PLAN_KEYS, 'Planner output');

  assertString(input.game, 'game');

  if (!ALLOWED_METRICS.includes(input.metric as any)) {
    throw new Error(`Unsupported metric: ${String(input.metric)}`);
  }

  if (!ALLOWED_GRANULARITY.includes(input.granularity as any)) {
    throw new Error(`Unsupported granularity: ${String(input.granularity)}`);
  }

  if (!isPlainObject(input.time_range)) {
    throw new Error('time_range must be an object');
  }
  assertNoExtraKeys(input.time_range, TIME_RANGE_KEYS, 'time_range');
  if (input.time_range.type !== 'last_n_days') {
    throw new Error('time_range.type must be last_n_days');
  }
  assertNumber(input.time_range.n, 'time_range.n');
  if ((input.time_range.n as number) <= 0) {
    throw new Error('time_range.n must be positive');
  }

  if (!Array.isArray(input.breakdowns)) {
    throw new Error('breakdowns must be an array');
  }
  for (const breakdown of input.breakdowns) {
    if (!ALLOWED_BREAKDOWNS.includes(breakdown as Breakdown)) {
      throw new Error(`Unsupported breakdown: ${String(breakdown)}`);
    }
  }

  if (!isPlainObject(input.comparison)) {
    throw new Error('comparison must be an object');
  }
  assertNoExtraKeys(input.comparison, COMPARISON_KEYS, 'comparison');
  if (!ALLOWED_COMPARISONS.includes(input.comparison.type as any)) {
    throw new Error(`Unsupported comparison: ${String(input.comparison.type)}`);
  }

  if (!Array.isArray(input.analysis)) {
    throw new Error('analysis must be an array');
  }

  if (!Array.isArray(input.filters)) {
    throw new Error('filters must be an array');
  }
  for (const filter of input.filters) {
    if (!isPlainObject(filter)) {
      throw new Error('filter must be an object');
    }
    assertNoExtraKeys(filter, FILTER_KEYS, 'filter');
    assertString(filter.field, 'filter.field');
    assertString(filter.op, 'filter.op');
    if (typeof filter.value !== 'string' && typeof filter.value !== 'number') {
      throw new Error('filter.value must be string or number');
    }
  }

  if (input.response_mode !== 'short' && input.response_mode !== 'deep') {
    throw new Error('response_mode must be short or deep');
  }

  const metric = input.metric as PlannerOutput['metric'];
  const requestedBreakdowns = input.breakdowns as Breakdown[];
  const supported = METRIC_BREAKDOWN_SUPPORT[metric];
  const unsupported = requestedBreakdowns.filter((b) => !supported.includes(b));
  if (unsupported.length > 0) {
    throw new Error(
      `Breakdowns not supported for ${metric}: ${unsupported.join(', ')}`
    );
  }

  return input as unknown as PlannerOutput;
};

export const validateExecutorOutput = (input: unknown): void => {
  if (!isPlainObject(input)) {
    throw new Error('Executor output must be an object');
  }

  const required = [
    'question',
    'context',
    'summary',
    'timeseries',
    'breakdown_table',
    'attribution',
    'confidence',
    'response_mode'
  ];
  assertNoExtraKeys(input, required, 'Executor output');

  assertString(input.question, 'question');
  if (!isPlainObject(input.context)) {
    throw new Error('context must be an object');
  }
  if (!isPlainObject((input.context as any).plan)) {
    throw new Error('context.plan must be an object');
  }
  if (!['high', 'medium', 'low'].includes(String(input.confidence))) {
    throw new Error('confidence must be high|medium|low');
  }
  if (!['short', 'deep'].includes(String(input.response_mode))) {
    throw new Error('response_mode must be short|deep');
  }
  if (!Array.isArray(input.timeseries)) {
    throw new Error('timeseries must be an array');
  }
  if (!Array.isArray(input.breakdown_table)) {
    throw new Error('breakdown_table must be an array');
  }
  if (!Array.isArray(input.attribution)) {
    throw new Error('attribution must be an array');
  }
};
