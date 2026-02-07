import { cache, generateCacheKey } from '../utils/simpleCache';
import { PlannerOutput, ExecutorOutput } from './types';
import crypto from 'crypto';

const PLAN_TTL_SECONDS = parseInt(process.env.AI_PLAN_CACHE_TTL_SECONDS || '3600', 10);
const RESULT_TTL_SECONDS = parseInt(process.env.AI_RESULT_CACHE_TTL_SECONDS || '300', 10);

export const normalizeQuestion = (question: string): string => {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const hashPlan = (plan: PlannerOutput): string => {
  const payload = JSON.stringify(plan);
  return crypto.createHash('sha1').update(payload).digest('hex');
};

export const getPlanCache = (question: string): PlannerOutput | null => {
  const key = generateCacheKey('ai', 'plan', normalizeQuestion(question));
  return cache.get<PlannerOutput>(key);
};

export const setPlanCache = (question: string, plan: PlannerOutput): void => {
  const key = generateCacheKey('ai', 'plan', normalizeQuestion(question));
  cache.set(key, plan, PLAN_TTL_SECONDS);
};

export const getResultCache = (
  tenantId: string,
  plan: PlannerOutput
): ExecutorOutput | null => {
  const key = generateCacheKey('ai', 'result', tenantId, hashPlan(plan));
  return cache.get<ExecutorOutput>(key);
};

export const setResultCache = (
  tenantId: string,
  plan: PlannerOutput,
  result: ExecutorOutput
): void => {
  const key = generateCacheKey('ai', 'result', tenantId, hashPlan(plan));
  cache.set(key, result, RESULT_TTL_SECONDS);
};
