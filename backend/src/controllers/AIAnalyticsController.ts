import { Request, Response } from 'express';
import { AIAnalyticsService } from '../services/AIAnalyticsService';

export class AIAnalyticsController {
    private aiAnalyticsService: AIAnalyticsService;

    constructor() {
        this.aiAnalyticsService = new AIAnalyticsService();
    }

    /**
     * Process a natural language analytics query
     * POST /api/ai-analytics/query
     */
    processQuery = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!this.aiAnalyticsService.isAIEnabled()) {
                res.status(503).json({ 
                    error: 'AI features are currently unavailable. Please configure OPENAI_API_KEY.',
                    success: false
                });
                return;
            }

            const { query, gameId, userId } = req.body;

            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            const result = await this.aiAnalyticsService.processQuery(query, gameId, userId);

            res.json({
                success: true,
                query,
                ...result
            });
        } catch (error) {
            console.error('Error processing AI analytics query:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ 
                success: false,
                error: 'Failed to process query',
                details: errorMessage
            });
        }
    };

    /**
     * Check AI service health and configuration
     * GET /api/ai-analytics/health
     */
    checkHealth = async (req: Request, res: Response): Promise<void> => {
        try {
            const isEnabled = this.aiAnalyticsService.isAIEnabled();
            const apiKeySet = !!process.env.OPENAI_API_KEY;
            const apiKeyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 7) : 'Not set';
            
            res.json({
                success: true,
                aiEnabled: isEnabled,
                apiKeyConfigured: apiKeySet,
                apiKeyPrefix: apiKeyPrefix,
                model: process.env.OPENAI_MODEL || 'gpt-4',
                status: isEnabled ? 'operational' : 'disabled'
            });
        } catch (error) {
            console.error('Error checking AI health:', error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to check AI health' 
            });
        }
    };

    /**
     * Get example queries to help users understand capabilities
     * GET /api/ai-analytics/examples
     */
    getExampleQueries = async (req: Request, res: Response): Promise<void> => {
        try {
            const examples = [
                {
                    category: 'Metrics',
                    queries: [
                        'What is the current user engagement rate?',
                        'Show me today\'s active users',
                        'How much revenue did we generate last week?',
                        'What are the session durations for this month?'
                    ]
                },
                {
                    category: 'Trends',
                    queries: [
                        'Show me the engagement trend over the last month',
                        'How has user retention changed over time?',
                        'What is the revenue trend for the past quarter?',
                        'Are session lengths increasing or decreasing?'
                    ]
                },
                {
                    category: 'Comparisons',
                    queries: [
                        'Compare this month\'s revenue to last month',
                        'How does today\'s engagement compare to yesterday?',
                        'Show me the difference in user acquisition this week vs last week'
                    ]
                },
                {
                    category: 'Anomalies',
                    queries: [
                        'Detect any unusual spikes in user activity',
                        'Are there any anomalies in revenue patterns?',
                        'Show me any unexpected changes in engagement'
                    ]
                },
                {
                    category: 'Insights',
                    queries: [
                        'Why did engagement drop yesterday?',
                        'Explain the recent increase in user sessions',
                        'What factors might be affecting retention rates?',
                        'Give me insights about our monetization performance'
                    ]
                }
            ];

            res.json({
                success: true,
                examples
            });
        } catch (error) {
            console.error('Error getting example queries:', error);
            res.status(500).json({ error: 'Failed to get examples' });
        }
    };

    /**
     * Health check for AI analytics service
     * GET /api/ai-analytics/health
     */
    healthCheck = async (req: Request, res: Response): Promise<void> => {
        try {
            res.json({
                success: true,
                service: 'AI Analytics',
                status: 'operational',
                capabilities: [
                    'Natural language query processing',
                    'Metric extraction and analysis',
                    'Trend analysis',
                    'Anomaly detection',
                    'Contextual insights generation'
                ],
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error in AI analytics health check:', error);
            res.status(500).json({ error: 'Service unavailable' });
        }
    };
}