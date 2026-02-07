import { buildPlannerPrompt } from './prompts';
import { validatePlannerOutput } from './validation';
import { PlannerOutput } from './types';
import { AiLlmClient } from './llm';

const extractJson = (raw: string): unknown => {
  const match = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
  const jsonText = match?.[1] ?? raw;
  return JSON.parse(jsonText);
};

export class QueryPlanner {
  constructor(private llm: AiLlmClient) {}

  async plan(question: string, now: Date): Promise<PlannerOutput> {
    const today = now.toISOString().slice(0, 10);
    const prompt = buildPlannerPrompt(question, today);
    const raw = await this.llm.completeJson(prompt, 400);
    const parsed = extractJson(raw);
    return validatePlannerOutput(parsed);
  }
}
