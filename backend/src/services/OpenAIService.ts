import OpenAI from 'openai';
import logger from '../utils/logger';

export interface AIAnalysisRequest {
    query: string;
    analyticsData: any;
    businessContext: string;
    conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export interface AIAnalysisResponse {
    response: string;
    confidence: number;
    reasoning: string;
    suggestedActions?: string[];
    followUpQuestions?: string[];
}

export class OpenAIService {
    private openai: OpenAI;
    private model: string;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    }

    /**
     * Analyze analytics data using AI and provide intelligent insights
     */
    async analyzeAnalyticsQuery(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
        try {
            const systemPrompt = this.buildSystemPrompt();
            const userPrompt = this.buildUserPrompt(request);

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                ...this.buildConversationContext(request.conversationHistory || []),
                { role: 'user', content: userPrompt }
            ];

            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages,
                temperature: 0.1, // Low temperature for consistent, factual responses
                max_tokens: 800,
                response_format: { type: 'json_object' }
            });

            const responseContent = completion.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('No response from OpenAI');
            }

            const parsedResponse = JSON.parse(responseContent);

            return {
                response: parsedResponse.response,
                confidence: parsedResponse.confidence || 0.8,
                reasoning: parsedResponse.reasoning || '',
                suggestedActions: parsedResponse.suggestedActions || [],
                followUpQuestions: parsedResponse.followUpQuestions || []
            };

        } catch (error) {
            logger.error('Error in OpenAI analysis:', error);
            throw new Error('Failed to analyze query with AI');
        }
    }

    /**
     * Extract intent and metrics from user query using AI
     */
    async extractQueryIntent(query: string, availableMetrics: string[]): Promise<{
        intent: string;
        metrics: string[];
        timeframe: { start: Date; end: Date };
        confidence: number;
        reasoning: string;
    }> {
        try {
            const systemPrompt = `You are an expert at understanding analytics queries. Extract the intent, relevant metrics, and timeframe from user queries.

Available metrics: ${availableMetrics.join(', ')}

Return a JSON object with:
- intent: one of "metric_query", "trend_analysis", "anomaly_detection", "comparison", "insight_request"
- metrics: array of relevant metric names from the available metrics
- timeframe: object with "days_back" (number of days from today)
- confidence: number between 0 and 1
- reasoning: brief explanation of your analysis

Today's date: ${new Date().toISOString().split('T')[0]}`;

            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                temperature: 0.1,
                max_tokens: 300,
                response_format: { type: 'json_object' }
            });

            const responseContent = completion.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('No response from OpenAI');
            }

            const parsed = JSON.parse(responseContent);

            // Convert days_back to actual dates
            const now = new Date();
            const daysBack = parsed.timeframe?.days_back || 7;
            const start = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

            return {
                intent: parsed.intent,
                metrics: parsed.metrics || [],
                timeframe: { start, end: now },
                confidence: parsed.confidence || 0.5,
                reasoning: parsed.reasoning || ''
            };

        } catch (error) {
            logger.error('Error extracting query intent:', error);
            throw new Error('Failed to understand query intent');
        }
    }

    private buildSystemPrompt(): string {
        return `You are an expert analytics AI assistant for a game analytics platform. Your role is to:

1. Analyze game analytics data and provide clear, actionable insights
2. Explain trends, patterns, and anomalies in user behavior
3. Consider business context (releases, features, events) when analyzing data
4. Provide specific, data-driven recommendations
5. Maintain a professional but conversational tone

Guidelines:
- Always ground your analysis in the provided data
- Explain your reasoning clearly
- Suggest actionable next steps when appropriate
- Consider multiple perspectives (technical, business, user experience)
- Be honest about limitations or areas needing more investigation

Respond in JSON format with:
{
  "response": "Main response to the user",
  "confidence": 0.8,
  "reasoning": "Explanation of your analysis approach",
  "suggestedActions": ["action1", "action2"],
  "followUpQuestions": ["question1", "question2"]
}`;
    }

    private buildUserPrompt(request: AIAnalysisRequest): string {
        return `User Query: "${request.query}"

Analytics Data:
${JSON.stringify(request.analyticsData, null, 2)}

Business Context:
${request.businessContext}

Please analyze this data and provide insights that directly address the user's query. Consider both the raw numbers and the business context when forming your response.`;
    }

    private buildConversationContext(history: ConversationMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        // Include last 5 messages for context
        return history
            .slice(-5)
            .map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content
            }));
    }

    /**
     * Test OpenAI connection
     */
    async testConnection(): Promise<boolean> {
        try {
            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [{ role: 'user', content: 'Hello, respond with just "OK"' }],
                max_tokens: 10
            });

            return !!completion.choices[0]?.message?.content;
        } catch (error) {
            logger.error('OpenAI connection test failed:', error);
            return false;
        }
    }
}