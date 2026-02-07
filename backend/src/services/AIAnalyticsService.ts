import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AiLlmClient } from '../ai/llm';
import { QueryPlanner } from '../ai/planner';
import { AnalyticsExecutor } from '../ai/executor';
import { buildNarrationPrompt } from '../ai/prompts';
import { validateExecutorOutput } from '../ai/validation';
import { getPlanCache, getResultCache, setPlanCache, setResultCache } from '../ai/cache';
import { ExecutorOutput, PlannerOutput } from '../ai/types';

const DEFAULT_RESPONSE = 'Sorry, I encountered an error. Please try again.';

const extractNumbers = (text: string): number[] => {
  const matches = text.match(/-?\d+(\.\d+)?/g) || [];
  return matches.map((value) => Number(value)).filter((v) => !Number.isNaN(v));
};

const collectNumbers = (input: unknown, output: number[] = []): number[] => {
  if (typeof input === 'number' && !Number.isNaN(input)) {
    output.push(Number(input.toFixed(2)));
  } else if (Array.isArray(input)) {
    input.forEach((item) => collectNumbers(item, output));
  } else if (input && typeof input === 'object') {
    Object.values(input).forEach((value) => collectNumbers(value, output));
  }
  return output;
};

const numbersAllowed = (result: ExecutorOutput) => {
  const values = collectNumbers(result);
  return new Set(values.map((v) => v.toFixed(2)));
};

const validateNarrationNumbers = (text: string, allowed: Set<string>): boolean => {
  const found = extractNumbers(text);
  if (found.length === 0) return true;
  return found.every((value) => {
    const fixed = Number(value.toFixed(2)).toFixed(2);
    return allowed.has(fixed);
  });
};

const buildFallbackResponse = (result: ExecutorOutput): string => {
  const metric = result.context.plan.metric;
  const summaryValue = result.summary.value;
  const comparison = result.summary.previous;
  const change = result.summary.change;
  const changePct = result.summary.changePct;

  let base = `The ${metric} over the requested period is ${summaryValue}.`;
  if (typeof comparison === 'number' && typeof change === 'number') {
    const delta = change >= 0 ? `+${change}` : `${change}`;
    base += ` Compared to the previous period, change is ${delta}`;
    if (typeof changePct === 'number') {
      base += ` (${changePct}%).`;
    } else {
      base += '.';
    }
  }

  if (result.attribution.length === 0) {
    base += ' Attribution is inconclusive.';
  }

  return base;
};

export class AIAnalyticsService {
  private llm: AiLlmClient;
  private planner: QueryPlanner;
  private executor: AnalyticsExecutor;

  constructor() {
    this.llm = new AiLlmClient();
    this.planner = new QueryPlanner(this.llm);
    this.executor = new AnalyticsExecutor();
  }

  public isAIEnabled(): boolean {
    return this.llm.enabled();
  }

  public async processQuery(question: string, tenantId: string): Promise<{
    response: string;
    confidence: number;
    data: ExecutorOutput;
    traceId: string;
    latencyMs: number;
    plan: PlannerOutput;
  }> {
    const traceId = uuidv4();
    const startedAt = Date.now();

    if (!this.isAIEnabled()) {
      throw new Error('AI features are disabled. Please configure OPENAI_API_KEY.');
    }

    let plan = getPlanCache(question);
    if (!plan) {
      plan = await this.planner.plan(question, new Date());
      setPlanCache(question, plan);
    }

    let result = getResultCache(tenantId, plan);
    if (!result) {
      result = await this.executor.execute(question, tenantId, plan);
      setResultCache(tenantId, plan, result);
    }

    validateExecutorOutput(result);

    const prompt = buildNarrationPrompt(result);
    const maxTokens = plan.response_mode === 'deep' ? 600 : 220;
    let response = await this.llm.completeText(prompt, maxTokens);

    const allowedNumbers = numbersAllowed(result);
    if (!validateNarrationNumbers(response, allowedNumbers)) {
      logger.warn('[AIAnalytics] narrator used unsupported numbers', {
        traceId,
        question
      });
      response = buildFallbackResponse(result);
    }

    const latencyMs = Date.now() - startedAt;

    logger.info('[AIAnalytics] query processed', {
      traceId,
      tenantId,
      metric: plan.metric,
      breakdowns: plan.breakdowns,
      latencyMs
    });

    const confidenceMap: Record<ExecutorOutput['confidence'], number> = {
      high: 0.9,
      medium: 0.6,
      low: 0.3
    };

    return {
      response,
      confidence: confidenceMap[result.confidence],
      data: result,
      traceId,
      latencyMs,
      plan
    };
  }
}
