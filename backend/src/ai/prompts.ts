import { PlannerOutput, ExecutorOutput } from './types';

export const buildPlannerPrompt = (question: string, todayIso: string) => {
  return `SYSTEM:\nYou are a strict analytics planner. You must output JSON only that matches the schema.\nNo extra text. No markdown. Use only allowed fields and values.\n\nUSER:\nQuestion: "${question}"\n\nSchema:\n{\n  "game": "string",\n  "metric": "revenue|dau|installs|d1_retention|d7_retention|arpdau",\n  "granularity": "day|week",\n  "time_range": {"type":"last_n_days","n":number},\n  "breakdowns": ["country"|"platform"],\n  "comparison": {"type":"none|previous_period"},\n  "analysis": ["trend","top_contributors"],\n  "filters": [],\n  "response_mode": "short|deep"\n}\n\nRules:\n- Only return JSON.\n- Default granularity=day.\n- Default response_mode=short.\n- If the question requests a comparison, use comparison.type=previous_period.\n- If you are unsure about the game name, still set game to the closest match and set response_mode=deep.\n- Today's date: ${todayIso}`;
};

export const buildNarrationPrompt = (result: ExecutorOutput) => {
  return `SYSTEM:\nYou are a narrator. You ONLY use numbers from the JSON provided.\nDo not invent numbers. If attribution is weak or missing, say "inconclusive".\nAnswer directly without mentioning internals.\n\nUSER:\nResult JSON:\n${JSON.stringify(result)}\n\nAnswer requirements:\n- Direct answer\n- Cite key numbers that exist in JSON only\n- If confidence is low or attribution empty, say "inconclusive"`;
};
