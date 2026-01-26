import { PrismaClient } from '@prisma/client';
import prisma from '../prisma';

interface ReleaseData {
    version: string;
    description?: string;
    gameId?: string;
    rolloutType?: 'full' | 'gradual' | 'beta';
    tags?: string[];
    features?: {
        name: string;
        description?: string;
        type: 'ui_change' | 'gameplay_change' | 'performance' | 'monetization' | 'analytics';
        expectedImpact?: 'positive' | 'negative' | 'neutral';
        impactMetrics?: any;
        rolloutStartDate?: Date;
        rolloutEndDate?: Date;
    }[];
}

interface BusinessEventData {
    name: string;
    description?: string;
    type: 'marketing_campaign' | 'competitor_launch' | 'holiday' | 'promotion' | 'external_event';
    startDate: Date;
    endDate?: Date;
    gameId?: string;
    impact?: string;
    metadata?: any;
    tags?: string[];
}

export class ContextManager {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    /**
     * Add a new release with its features to the context system
     */
    async addRelease(releaseData: ReleaseData): Promise<string> {
        try {
            const release = await this.prisma.release.create({
                data: {
                    version: releaseData.version,
                    releaseDate: new Date(),
                    ...(releaseData.description && { description: releaseData.description }),
                    ...(releaseData.gameId && { gameId: releaseData.gameId }),
                    rolloutType: releaseData.rolloutType || 'full',
                    ...(releaseData.tags && { tags: releaseData.tags }),
                    features: {
                        create: releaseData.features?.map(feature => ({
                            name: feature.name,
                            ...(feature.description && { description: feature.description }),
                            type: feature.type,
                            ...(feature.expectedImpact && { expectedImpact: feature.expectedImpact }),
                            ...(feature.impactMetrics && { impactMetrics: feature.impactMetrics }),
                            ...(feature.rolloutStartDate && { rolloutStartDate: feature.rolloutStartDate }),
                            ...(feature.rolloutEndDate && { rolloutEndDate: feature.rolloutEndDate })
                        })) || []
                    }
                },
                include: {
                    features: true
                }
            });

            console.log(`Release ${release.version} added to context system with ${release.features.length} features`);
            return release.id;
        } catch (error) {
            console.error('Error adding release:', error);
            throw error;
        }
    }

    /**
     * Add a business event that might affect metrics
     */
    async addBusinessEvent(eventData: BusinessEventData): Promise<string> {
        try {
            const businessEvent = await this.prisma.businessEvent.create({
                data: {
                    name: eventData.name,
                    ...(eventData.description && { description: eventData.description }),
                    type: eventData.type,
                    startDate: eventData.startDate,
                    ...(eventData.endDate && { endDate: eventData.endDate }),
                    ...(eventData.gameId && { gameId: eventData.gameId }),
                    ...(eventData.impact && { impact: eventData.impact }),
                    ...(eventData.metadata && { metadata: eventData.metadata }),
                    ...(eventData.tags && { tags: eventData.tags })
                }
            });

            console.log(`Business event ${businessEvent.name} added to context system`);
            return businessEvent.id;
        } catch (error) {
            console.error('Error adding business event:', error);
            throw error;
        }
    }

    /**
     * Get all relevant context for a specific date range
     */
    async getContextForDate(startDate: Date, endDate: Date, gameId?: string): Promise<any> {
        try {
            const whereClause = {
                ...(gameId && { gameId }),
                OR: [
                    {
                        releaseDate: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    {
                        features: {
                            some: {
                                OR: [
                                    {
                                        rolloutStartDate: {
                                            gte: startDate,
                                            lte: endDate
                                        }
                                    },
                                    {
                                        rolloutEndDate: {
                                            gte: startDate,
                                            lte: endDate
                                        }
                                    }
                                ]
                            }
                        }
                    }
                ]
            };

            const [releases, businessEvents] = await Promise.all([
                this.prisma.release.findMany({
                    where: whereClause,
                    include: {
                        features: true,
                        game: true
                    },
                    orderBy: { releaseDate: 'desc' }
                }),
                this.prisma.businessEvent.findMany({
                    where: {
                        ...(gameId && { gameId }),
                        OR: [
                            {
                                startDate: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            },
                            {
                                endDate: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            },
                            {
                                AND: [
                                    { startDate: { lte: startDate } },
                                    {
                                        OR: [
                                            { endDate: { gte: endDate } },
                                            { endDate: null }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    include: {
                        game: true
                    },
                    orderBy: { startDate: 'desc' }
                })
            ]);

            return {
                releases,
                businessEvents,
                dateRange: { startDate, endDate }
            };
        } catch (error) {
            console.error('Error getting context for date:', error);
            throw error;
        }
    }

    /**
     * Generate a summary of context for AI consumption
     */
    async generateContextSummary(startDate: Date, endDate: Date, gameId?: string): Promise<string> {
        try {
            const context = await this.getContextForDate(startDate, endDate, gameId);

            let summary = `Context Summary for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}:\n\n`;

            // Add releases context
            if (context.releases.length > 0) {
                summary += "RELEASES:\n";
                context.releases.forEach((release: any) => {
                    summary += `- Version ${release.version} (${release.releaseDate.toISOString().split('T')[0]}): ${release.description || 'No description'}\n`;
                    if (release.features.length > 0) {
                        summary += "  Features:\n";
                        release.features.forEach((feature: any) => {
                            summary += `    * ${feature.name} (${feature.type}): ${feature.description || 'No description'}\n`;
                            if (feature.expectedImpact) {
                                summary += `      Expected impact: ${feature.expectedImpact}\n`;
                            }
                        });
                    }
                });
                summary += "\n";
            }

            // Add business events context
            if (context.businessEvents.length > 0) {
                summary += "BUSINESS EVENTS:\n";
                context.businessEvents.forEach((event: any) => {
                    const endInfo = event.endDate ? ` to ${event.endDate.toISOString().split('T')[0]}` : ' (ongoing)';
                    summary += `- ${event.name} (${event.type}, ${event.startDate.toISOString().split('T')[0]}${endInfo}): ${event.description || 'No description'}\n`;
                    if (event.impact) {
                        summary += `  Expected impact: ${event.impact}\n`;
                    }
                });
                summary += "\n";
            }

            if (context.releases.length === 0 && context.businessEvents.length === 0) {
                summary += "No significant releases or business events recorded for this period.\n";
            }

            return summary;
        } catch (error) {
            console.error('Error generating context summary:', error);
            throw error;
        }
    }

    /**
     * Store an AI query and its response for learning purposes
     */
    async storeAIQuery(
        query: string,
        response: string,
        confidence: number,
        queryType: 'natural_language' | 'structured' | 'exploratory' = 'natural_language',
        gameId?: string,
        userId?: string,
        context?: any
    ): Promise<string> {
        try {
            const aiQuery = await this.prisma.aiQuery.create({
                data: {
                    query,
                    queryType,
                    ...(context && { context }),
                    response,
                    responseType: 'text', // Could be expanded later
                    confidence,
                    ...(gameId && { gameId }),
                    ...(userId && { userId })
                }
            });

            return aiQuery.id;
        } catch (error) {
            console.error('Error storing AI query:', error);
            throw error;
        }
    }

    /**
     * Store an AI-generated insight
     */
    async storeInsight(
        title: string,
        description: string,
        type: 'pattern' | 'anomaly' | 'recommendation' | 'prediction',
        confidence: number,
        gameId?: string,
        queryId?: string,
        dateRange?: { start: Date; end: Date },
        metrics?: any,
        metadata?: any
    ): Promise<string> {
        try {
            const insight = await this.prisma.aiInsight.create({
                data: {
                    title,
                    description,
                    type,
                    confidence,
                    ...(gameId && { gameId }),
                    ...(queryId && { queryId }),
                    ...(dateRange && { dateRange }),
                    ...(metrics && { metrics }),
                    ...(metadata && { metadata })
                }
            });

            return insight.id;
        } catch (error) {
            console.error('Error storing insight:', error);
            throw error;
        }
    }

    /**
     * Get recent insights for a game
     */
    async getRecentInsights(gameId?: string, limit: number = 10): Promise<any[]> {
        try {
            return await this.prisma.aiInsight.findMany({
                where: {
                    ...(gameId && { gameId }),
                    status: 'active'
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    query: true,
                    game: true
                }
            });
        } catch (error) {
            console.error('Error getting recent insights:', error);
            throw error;
        }
    }

    /**
     * Get all releases for a game (or all games if no gameId provided)
     */
    async getReleases(gameId?: string): Promise<any[]> {
        try {
            return await this.prisma.release.findMany({
                where: {
                    ...(gameId && { gameId })
                },
                include: {
                    features: true,
                    game: true
                },
                orderBy: { releaseDate: 'desc' }
            });
        } catch (error) {
            console.error('Error getting releases:', error);
            throw error;
        }
    }

    /**
     * Get all business events for a game (or all games if no gameId provided)
     */
    async getBusinessEvents(gameId?: string): Promise<any[]> {
        try {
            return await this.prisma.businessEvent.findMany({
                where: {
                    ...(gameId && { gameId })
                },
                include: {
                    game: true
                },
                orderBy: { startDate: 'desc' }
            });
        } catch (error) {
            console.error('Error getting business events:', error);
            throw error;
        }
    }

    /**
     * Update a release
     */
    async updateRelease(releaseId: string, updateData: Partial<ReleaseData & { tags?: string[] }>): Promise<void> {
        try {
            await this.prisma.release.update({
                where: { id: releaseId },
                data: {
                    ...(updateData.version && { version: updateData.version }),
                    ...(updateData.description !== undefined && { description: updateData.description }),
                    ...(updateData.gameId && { gameId: updateData.gameId }),
                    ...(updateData.rolloutType && { rolloutType: updateData.rolloutType }),
                    ...(updateData.tags && { tags: updateData.tags }),
                    // Handle features update if provided
                    ...(updateData.features && {
                        features: {
                            deleteMany: {},
                            create: updateData.features.map(feature => ({
                                name: feature.name,
                                ...(feature.description && { description: feature.description }),
                                type: feature.type,
                                ...(feature.expectedImpact && { expectedImpact: feature.expectedImpact }),
                                ...(feature.impactMetrics && { impactMetrics: feature.impactMetrics }),
                                ...(feature.rolloutStartDate && { rolloutStartDate: feature.rolloutStartDate }),
                                ...(feature.rolloutEndDate && { rolloutEndDate: feature.rolloutEndDate })
                            }))
                        }
                    })
                }
            });

            console.log(`Release ${releaseId} updated successfully`);
        } catch (error) {
            console.error('Error updating release:', error);
            throw error;
        }
    }

    /**
     * Update a business event
     */
    async updateBusinessEvent(eventId: string, updateData: Partial<BusinessEventData & { tags?: string[] }>): Promise<void> {
        try {
            await this.prisma.businessEvent.update({
                where: { id: eventId },
                data: {
                    ...(updateData.name && { name: updateData.name }),
                    ...(updateData.description !== undefined && { description: updateData.description }),
                    ...(updateData.type && { type: updateData.type }),
                    ...(updateData.startDate && { startDate: updateData.startDate }),
                    ...(updateData.endDate !== undefined && { endDate: updateData.endDate }),
                    ...(updateData.gameId && { gameId: updateData.gameId }),
                    ...(updateData.impact !== undefined && { impact: updateData.impact }),
                    ...(updateData.metadata && { metadata: updateData.metadata }),
                    ...(updateData.tags && { tags: updateData.tags })
                }
            });

            console.log(`Business event ${eventId} updated successfully`);
        } catch (error) {
            console.error('Error updating business event:', error);
            throw error;
        }
    }

    /**
     * Close the database connection
     */
    async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }
}