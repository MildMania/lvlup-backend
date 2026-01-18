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
    private openai: OpenAI | null;
    private model: string;
    private isEnabled: boolean;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            logger.warn('OPENAI_API_KEY not set. AI features will be disabled.');
            this.openai = null;
            this.isEnabled = false;
            this.model = 'gpt-4';
        } else {
            try {
                // Log partial key for debugging (first 7 chars only)
                const maskedKey = apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4);
                logger.info(`Initializing OpenAI with key: ${maskedKey}`);
                
                this.openai = new OpenAI({
                    apiKey: apiKey,
                });
                this.model = process.env.OPENAI_MODEL || 'gpt-4';
                this.isEnabled = true;
                logger.info('OpenAI service initialized successfully with model: ' + this.model);
            } catch (error) {
                logger.error('Failed to initialize OpenAI service:', error);
                this.openai = null;
                this.isEnabled = false;
                this.model = 'gpt-4';
            }
        }
    }

    public isAIEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Analyze analytics data using AI and provide intelligent insights
     */
    async analyzeAnalyticsQuery(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
        if (!this.isEnabled || !this.openai) {
            throw new Error('AI features are disabled. Please set OPENAI_API_KEY environment variable.');
        }

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
                max_tokens: 800
            });

            const responseContent = completion.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('No response from OpenAI');
            }

            // Try to parse JSON from the response
            let parsedResponse;
            try {
                // Extract JSON if wrapped in markdown code blocks
                const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                                 responseContent.match(/```\s*([\s\S]*?)\s*```/);
                const jsonText = jsonMatch ? jsonMatch[1] : responseContent;
                parsedResponse = JSON.parse(jsonText!);
            } catch (parseError) {
                logger.warn('Failed to parse JSON response, using fallback', parseError);
                // Fallback if JSON parsing fails
                parsedResponse = {
                    response: responseContent,
                    confidence: 0.5,
                    reasoning: 'AI response could not be parsed as structured data'
                };
            }

            return {
                response: parsedResponse.response,
                confidence: parsedResponse.confidence || 0.8,
                reasoning: parsedResponse.reasoning || '',
                suggestedActions: parsedResponse.suggestedActions || [],
                followUpQuestions: parsedResponse.followUpQuestions || []
            };

        } catch (error) {
            logger.error('Error in OpenAI analysis:', error);
            if (error instanceof Error) {
                logger.error('Error message:', error.message);
                logger.error('Error stack:', error.stack);
            }
            throw new Error(`Failed to analyze query with AI: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        if (!this.isEnabled || !this.openai) {
            throw new Error('AI features are disabled. Please set OPENAI_API_KEY environment variable.');
        }

        try {
            const systemPrompt = `You are an expert at understanding analytics queries. Extract the intent, relevant metrics, and timeframe from user queries.

Available metrics: ${availableMetrics.join(', ')}

You must respond with ONLY a JSON object (no other text) with these fields:
- intent: one of "metric_query", "trend_analysis", "anomaly_detection", "comparison", "insight_request"
- metrics: array of relevant metric names from the available metrics
- timeframe: object with "days_back" (number of days from today)
- confidence: number between 0 and 1
- reasoning: brief explanation of your analysis

Today's date: ${new Date().toISOString().split('T')[0]}

Example response format:
{
  "intent": "metric_query",
  "metrics": ["retention", "playtime"],
  "timeframe": {"days_back": 7},
  "confidence": 0.9,
  "reasoning": "User is asking about retention and playtime metrics for the past week"
}`;

            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: query }
                ],
                temperature: 0.1,
                max_tokens: 300
            });

            const responseContent = completion.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('No response from OpenAI');
            }

            // Try to parse JSON from the response
            let parsedIntent;
            try {
                // Extract JSON if wrapped in markdown code blocks
                const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                                 responseContent.match(/```\s*([\s\S]*?)\s*```/);
                const jsonText = jsonMatch ? jsonMatch[1] : responseContent;
                parsedIntent = JSON.parse(jsonText!);
            } catch (parseError) {
                logger.warn('Failed to parse intent JSON, using fallback', parseError);
                // Fallback with basic intent extraction
                parsedIntent = {
                    intent: 'metric_query',
                    metrics: [],
                    timeframe: { days_back: 7 },
                    confidence: 0.3,
                    reasoning: 'Failed to parse structured response'
                };
            }

            // Convert days_back to actual dates
            const now = new Date();
            const daysBack = parsedIntent.timeframe?.days_back || 7;
            const start = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));

            return {
                intent: parsedIntent.intent,
                metrics: parsedIntent.metrics || [],
                timeframe: { start, end: now },
                confidence: parsedIntent.confidence || 0.5,
                reasoning: parsedIntent.reasoning || ''
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

You must respond with ONLY a valid JSON object (no other text) in this exact format:
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
        if (!this.isEnabled || !this.openai) {
            return false;
        }

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