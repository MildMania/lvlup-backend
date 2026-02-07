import { Request, Response } from 'express';
import { AIAnalyticsService } from '../services/AIAnalyticsService';
import prisma from '../prisma';

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

            const request = req as any;
            const { query, gameId, gameName } = req.body as {
                query?: string;
                gameId?: string;
                gameName?: string;
            };

            if (!query) {
                res.status(400).json({ error: 'Query is required' });
                return;
            }

            const tenantId = await this.resolveTenantId(request, gameId, gameName);
            if (!tenantId) {
                res.status(400).json({ error: 'gameId or gameName is required for this request' });
                return;
            }

            const result = await this.aiAnalyticsService.processQuery(query, tenantId);

            res.json({
                success: true,
                query,
                response: result.response,
                confidence: result.confidence,
                data: result.data,
                traceId: result.traceId,
                latencyMs: result.latencyMs
            });
        } catch (error) {
            console.error('Error processing AI analytics query:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            if (
                typeof errorMessage === 'string' &&
                (
                    errorMessage.includes('Ambiguous game name') ||
                    errorMessage.includes('No game found for name') ||
                    errorMessage.includes('not accessible') ||
                    errorMessage.includes('gameName must be')
                )
            ) {
                res.status(400).json({
                    success: false,
                    error: errorMessage
                });
                return;
            }

            res.status(500).json({ 
                success: false,
                error: 'Failed to process query',
                details: errorMessage
            });
        }
    };

    private async resolveTenantId(req: any, gameId?: string, gameName?: string): Promise<string | null> {
        if (req.game?.id) {
            return req.game.id;
        }

        if (!req.dashboardUser?.id) {
            return gameId || null;
        }

        const userId = String(req.dashboardUser.id);
        const { allGames, allowedGameIds } = await this.getAllowedGamesForDashboardUser(userId);

        if (gameId) {
            if (allGames || allowedGameIds.has(gameId)) {
                return gameId;
            }
            throw new Error('Requested gameId is not accessible for this user');
        }

        if (gameName) {
            const candidate = gameName.trim();
            if (!candidate) {
                throw new Error('gameName must be a non-empty string');
            }

            const exactMatches = await prisma.game.findMany({
                where: {
                    ...(allGames ? {} : { id: { in: Array.from(allowedGameIds) } }),
                    name: { equals: candidate, mode: 'insensitive' }
                },
                select: { id: true, name: true },
                take: 5
            });

            if (exactMatches.length === 1) {
                return exactMatches[0]!.id;
            }

            if (exactMatches.length > 1) {
                throw new Error(`Ambiguous game name. Matches: ${exactMatches.map(g => g.name).join(', ')}`);
            }

            const fuzzyMatches = await prisma.game.findMany({
                where: {
                    ...(allGames ? {} : { id: { in: Array.from(allowedGameIds) } }),
                    name: { contains: candidate, mode: 'insensitive' }
                },
                select: { id: true, name: true },
                take: 5
            });

            if (fuzzyMatches.length === 1) {
                return fuzzyMatches[0]!.id;
            }

            if (fuzzyMatches.length > 1) {
                throw new Error(`Ambiguous game name. Matches: ${fuzzyMatches.map(g => g.name).join(', ')}`);
            }

            throw new Error(`No game found for name: ${candidate}`);
        }

        // Backward-compatible fallback: pick first accessible game.
        if (allGames) {
            const firstGame = await prisma.game.findFirst({ select: { id: true } });
            return firstGame?.id || null;
        }

        return allowedGameIds.values().next().value || null;
    }

    private async getAllowedGamesForDashboardUser(userId: string): Promise<{ allGames: boolean; allowedGameIds: Set<string> }> {
        const teamMemberships = await prisma.teamMember.findMany({
            where: { userId },
            select: { teamId: true }
        });
        const teamIds = teamMemberships.map((m) => m.teamId);

        const accesses = await prisma.gameAccess.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { userId },
                            ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])
                        ]
                    },
                    {
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } }
                        ]
                    }
                ],
            },
            select: { gameId: true, allGames: true }
        });

        const allGames = accesses.some((a) => a.allGames);
        const allowedGameIds = new Set(
            accesses.map((a) => a.gameId).filter((id): id is string => Boolean(id))
        );

        return { allGames, allowedGameIds };
    }

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
                plannerModel: process.env.AI_PLANNER_MODEL || 'gpt-4o-mini',
                narratorModel: process.env.AI_NARRATOR_MODEL || 'gpt-4o-mini',
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
                        'Show daily revenue for the last 30 days',
                        'What is DAU by country this week?',
                        'Installs by platform over the last 14 days',
                        'ARPDAU for the last 7 days'
                    ]
                },
                {
                    category: 'Trends',
                    queries: [
                        'Revenue trend for the last 30 days',
                        'D7 retention trend by platform for the last 8 weeks',
                        'Compare last 7 days vs previous 7 days',
                        'Is any country driving the revenue decline?'
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
