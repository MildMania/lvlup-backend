import { ContextManager } from './ContextManager';
import { AnalyticsService } from './AnalyticsService';
import { OpenAIService, AIAnalysisRequest, ConversationMessage } from './OpenAIService';
import { PrismaClient } from '@prisma/client';

export class AIAnalyticsService {
  private contextManager: ContextManager;
  private analyticsService: AnalyticsService;
  private openaiService: OpenAIService;
  private prisma: PrismaClient;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();

  constructor() {
    this.contextManager = new ContextManager();
    this.analyticsService = new AnalyticsService();
    this.openaiService = new OpenAIService();
    this.prisma = new PrismaClient();
  }

  /**
   * Check if AI features are enabled
   */
  public isAIEnabled(): boolean {
    return this.openaiService.isAIEnabled();
  }

  /**
   * Process natural language query using real AI
   */
  async processQuery(query: string, gameId?: string, userId?: string): Promise<any> {
    try {
      // Create session key for conversation tracking
      const sessionKey = `${gameId || 'default'}_${userId || 'anonymous'}`;

      // Get available metrics for this game
      const availableMetrics = [
        'active_users', 'new_users', 'retention_rate', 'engagement_rate',
        'session_duration', 'session_count', 'total_events', 'revenue', 'arpu'
      ];

      // Use AI to understand the query intent
      const intentAnalysis = await this.openaiService.extractQueryIntent(query, availableMetrics);

      // Get real analytics data based on AI-extracted intent
      const analyticsData = await this.getAnalyticsData(intentAnalysis, gameId);

      // Get business context
      const businessContext = await this.contextManager.generateContextSummary(
        intentAnalysis.timeframe.start,
        intentAnalysis.timeframe.end
      );

      // Get conversation history for this session
      const conversationHistory = this.conversationHistory.get(sessionKey) || [];

      // Use AI to analyze the data and generate response
      const aiAnalysis = await this.openaiService.analyzeAnalyticsQuery({
        query,
        analyticsData,
        businessContext,
        conversationHistory
      });

      // Store this interaction in conversation history
      this.updateConversationHistory(sessionKey, query, aiAnalysis.response);

      // Store the query and response for learning
      await this.contextManager.storeAIQuery(
        query,
        aiAnalysis.response,
        aiAnalysis.confidence,
        'natural_language',
        gameId,
        userId,
        {
          intent: intentAnalysis,
          reasoning: aiAnalysis.reasoning,
          suggestedActions: aiAnalysis.suggestedActions
        }
      );

      return {
        response: aiAnalysis.response,
        data: analyticsData,
        confidence: aiAnalysis.confidence,
        reasoning: aiAnalysis.reasoning,
        suggestedActions: aiAnalysis.suggestedActions,
        followUpQuestions: aiAnalysis.followUpQuestions,
        intent: intentAnalysis
      };

    } catch (error) {
      console.error('Error processing AI query:', error);

      // Fallback to basic response if AI fails
      return {
        response: 'I apologize, but I encountered an issue processing your query with AI. The system may be temporarily unavailable. Please try again or rephrase your question.',
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get analytics data based on AI-extracted intent
   */
  private async getAnalyticsData(intentAnalysis: any, gameId?: string): Promise<any> {
    // Get the first available game for demo purposes
    const game = await this.prisma.game.findFirst();
    if (!game) {
      throw new Error('No games found');
    }

    const targetGameId = gameId || game.id;

    // Get real analytics data
    const analytics = await this.analyticsService.getAnalytics(
      targetGameId,
      intentAnalysis.timeframe.start,
      intentAnalysis.timeframe.end
    );

    // Map metrics to actual values
    const values: any = {};

    for (const metric of intentAnalysis.metrics) {
      switch (metric) {
        case 'engagement_rate':
          // Calculate engagement rate as sessions per user percentage
          values[metric] = Math.round((analytics.avgSessionsPerUser || 0) * 10);
          break;
        case 'retention_rate':
          // Calculate basic retention as percentage of active vs new users
          const retentionRate = (analytics.newUsers || 0) > 0 ?
            Math.round((((analytics.totalActiveUsers || 0) - (analytics.newUsers || 0)) / (analytics.totalActiveUsers || 1)) * 100) : 0;
          values[metric] = Math.max(retentionRate, 0);
          break;
        case 'active_users':
          values[metric] = analytics.totalActiveUsers || 0;
          break;
        case 'new_users':
          values[metric] = analytics.newUsers || 0;
          break;
        case 'session_duration':
          values[metric] = Math.round((analytics.avgSessionDuration || 0) / 1000);
          break;
        case 'session_count':
          values[metric] = analytics.totalSessions || 0;
          break;
        case 'total_events':
          values[metric] = analytics.totalEvents || 0;
          break;
        case 'revenue':
          // Estimate revenue based on engagement metrics (events per user * conversion factor)
          const eventsPerUser = (analytics.totalActiveUsers || 0) > 0 ? (analytics.totalEvents || 0) / (analytics.totalActiveUsers || 1) : 0;
          values[metric] = Math.round(eventsPerUser * 0.1); // $0.10 per significant event
          break;
        case 'arpu':
          // Calculate ARPU from estimated revenue
          const estimatedRevenue = (analytics.totalActiveUsers || 0) > 0 ?
            Math.round(((analytics.totalEvents || 0) / (analytics.totalActiveUsers || 1)) * 0.1) : 0;
          values[metric] = (analytics.totalActiveUsers || 0) > 0 ?
            Math.round((estimatedRevenue / (analytics.totalActiveUsers || 1)) * 100) / 100 : 0;
          break;
        default:
          values[metric] = 0;
      }
    }

    return {
      gameInfo: {
        id: game.id,
        name: game.name
      },
      metrics: intentAnalysis.metrics,
      values,
      timeframe: intentAnalysis.timeframe,
      summary: analytics
    };
  }

  /**
   * Update conversation history for a session
   */
  private updateConversationHistory(sessionKey: string, userQuery: string, aiResponse: string): void {
    const history = this.conversationHistory.get(sessionKey) || [];

    // Add user message
    history.push({
      role: 'user',
      content: userQuery,
      timestamp: new Date()
    });

    // Add AI response
    history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });

    // Keep only last 10 messages to manage memory
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    this.conversationHistory.set(sessionKey, history);
  }

  /**
   * Test AI connection
   */
  async testAIConnection(): Promise<boolean> {
    try {
      return await this.openaiService.testConnection();
    } catch (error) {
      console.error('AI connection test failed:', error);
      return false;
    }
  }

  /**
   * Clear conversation history for a session
   */
  clearConversationHistory(sessionKey: string): void {
    this.conversationHistory.delete(sessionKey);
  }

  /**
   * Get conversation history for a session
   */
  getConversationHistory(sessionKey: string): ConversationMessage[] {
    return this.conversationHistory.get(sessionKey) || [];
  }

  async disconnect(): Promise<void> {
    await this.contextManager.disconnect();
  }
}
