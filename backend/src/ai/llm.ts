import OpenAI from 'openai';
import logger from '../utils/logger';

export class AiLlmClient {
  private openai: OpenAI | null;
  private model: string;
  private narratorModel: string;
  private isEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn('OPENAI_API_KEY not set. AI planner/narrator disabled.');
      this.openai = null;
      this.model = 'gpt-4o-mini';
      this.narratorModel = 'gpt-4o-mini';
      this.isEnabled = false;
      return;
    }

    this.openai = new OpenAI({ apiKey });
    this.model = process.env.AI_PLANNER_MODEL || 'gpt-4o-mini';
    this.narratorModel = process.env.AI_NARRATOR_MODEL || 'gpt-4o-mini';
    this.isEnabled = true;
  }

  public enabled(): boolean {
    return this.isEnabled;
  }

  public async completeJson(prompt: string, maxTokens: number): Promise<string> {
    if (!this.openai || !this.isEnabled) {
      throw new Error('AI features are disabled. Please configure OPENAI_API_KEY.');
    }

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: maxTokens
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI planner');
    }

    return content.trim();
  }

  public async completeText(prompt: string, maxTokens: number): Promise<string> {
    if (!this.openai || !this.isEnabled) {
      throw new Error('AI features are disabled. Please configure OPENAI_API_KEY.');
    }

    const completion = await this.openai.chat.completions.create({
      model: this.narratorModel,
      messages: [
        { role: 'system', content: 'Return a concise answer.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: maxTokens
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI narrator');
    }

    return content.trim();
  }
}
