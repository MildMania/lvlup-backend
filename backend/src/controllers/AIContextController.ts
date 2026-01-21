import { Request, Response } from 'express';
import { ContextManager } from '../services/contextManager';

export class AIContextController {
    private contextManager: ContextManager;

    constructor() {
        this.contextManager = new ContextManager();
    }

    /**
     * Add a new release to the context system
     * POST /api/ai-context/release
     */
    addRelease = async (req: Request, res: Response): Promise<void> => {
        try {
            const { version, description, gameId, rolloutType, features } = req.body;

            if (!version) {
                res.status(400).json({ error: 'Version is required' });
                return;
            }

            const releaseId = await this.contextManager.addRelease({
                version,
                description,
                gameId,
                rolloutType,
                features
            });

            res.status(201).json({
                success: true,
                releaseId,
                message: `Release ${version} added successfully`
            });
        } catch (error) {
            console.error('Error adding release:', error);
            res.status(500).json({ error: 'Failed to add release' });
        }
    };

    /**
     * Get all releases
     * GET /api/ai-context/releases?gameId=optional
     */
    getReleases = async (req: Request, res: Response): Promise<void> => {
        try {
            const { gameId } = req.query;

            const releases = await this.contextManager.getReleases(gameId as string | undefined);

            res.json({
                success: true,
                data: releases
            });
        } catch (error) {
            console.error('Error getting releases:', error);
            res.status(500).json({ error: 'Failed to get releases' });
        }
    };

    /**
     * Add a business event to the context system
     * POST /api/ai-context/business-event
     */
    addBusinessEvent = async (req: Request, res: Response): Promise<void> => {
        try {
            const { name, description, type, startDate, endDate, gameId, impact, metadata } = req.body;

            if (!name || !type || !startDate) {
                res.status(400).json({ error: 'Name, type, and startDate are required' });
                return;
            }

            const eventId = await this.contextManager.addBusinessEvent({
                name,
                description,
                type,
                startDate: new Date(startDate + 'T00:00:00.000Z'),
                ...(endDate && { endDate: new Date(endDate + 'T23:59:59.999Z') }),
                gameId,
                impact,
                metadata
            });

            res.status(201).json({
                success: true,
                eventId,
                message: `Business event ${name} added successfully`
            });
        } catch (error) {
            console.error('Error adding business event:', error);
            res.status(500).json({ error: 'Failed to add business event' });
        }
    };

    /**
     * Get all business events
     * GET /api/ai-context/business-events?gameId=optional
     */
    getBusinessEvents = async (req: Request, res: Response): Promise<void> => {
        try {
            const { gameId } = req.query;

            const events = await this.contextManager.getBusinessEvents(gameId as string | undefined);

            res.json({
                success: true,
                data: events
            });
        } catch (error) {
            console.error('Error getting business events:', error);
            res.status(500).json({ error: 'Failed to get business events' });
        }
    };

    /**
     * Update a release
     * PUT /api/ai-context/release/:id
     */
    updateRelease = async (req: Request, res: Response): Promise<void> => {
        try {
            const id = req.params.id as string;
            if (!id) {
                res.status(400).json({ error: 'Release ID is required' });
                return;
            }
            
            const { version, description, gameId, rolloutType, features, tags } = req.body;

            if (!version) {
                res.status(400).json({ error: 'Version is required' });
                return;
            }

            await this.contextManager.updateRelease(id, {
                version,
                description,
                gameId: gameId || undefined,
                rolloutType,
                features,
                tags
            });

            res.json({
                success: true,
                message: `Release ${version} updated successfully`
            });
        } catch (error) {
            console.error('Error updating release:', error);
            res.status(500).json({ error: 'Failed to update release' });
        }
    };

    /**
     * Update a business event
     * PUT /api/ai-context/business-event/:id
     */
    updateBusinessEvent = async (req: Request, res: Response): Promise<void> => {
        try {
            const id = req.params.id as string;
            if (!id) {
                res.status(400).json({ error: 'Business event ID is required' });
                return;
            }
            
            const { name, description, type, startDate, endDate, gameId, impact, metadata, tags } = req.body;

            if (!name || !type || !startDate) {
                res.status(400).json({ error: 'Name, type, and startDate are required' });
                return;
            }

            await this.contextManager.updateBusinessEvent(id, {
                name,
                description,
                type,
                startDate: new Date(startDate + 'T00:00:00.000Z'),
                ...(endDate && { endDate: new Date(endDate + 'T23:59:59.999Z') }),
                gameId: gameId || undefined,
                impact,
                metadata,
                tags
            });

            res.json({
                success: true,
                message: `Business event ${name} updated successfully`
            });
        } catch (error) {
            console.error('Error updating business event:', error);
            res.status(500).json({ error: 'Failed to update business event' });
        }
    };

    /**
     * Get context for a specific date range
     * GET /api/ai-context/range?startDate=2024-01-01&endDate=2024-01-31&gameId=optional
     */
    getContextForDateRange = async (req: Request, res: Response): Promise<void> => {
        try {
            const { startDate, endDate, gameId } = req.query;

            if (!startDate || !endDate) {
                res.status(400).json({ error: 'startDate and endDate are required' });
                return;
            }

            const context = await this.contextManager.getContextForDate(
                new Date(startDate as string + 'T00:00:00.000Z'),
                new Date(endDate as string + 'T23:59:59.999Z'),
                gameId as string | undefined
            );

            res.json({
                success: true,
                data: context
            });
        } catch (error) {
            console.error('Error getting context for date range:', error);
            res.status(500).json({ error: 'Failed to get context' });
        }
    };

    /**
     * Get context summary for AI consumption
     * GET /api/ai-context/summary?startDate=2024-01-01&endDate=2024-01-31&gameId=optional
     */
    getContextSummary = async (req: Request, res: Response): Promise<void> => {
        try {
            const { startDate, endDate, gameId } = req.query;

            if (!startDate || !endDate) {
                res.status(400).json({ error: 'startDate and endDate are required' });
                return;
            }

            const summary = await this.contextManager.generateContextSummary(
                new Date(startDate as string),
                new Date(endDate as string),
                gameId as string | undefined
            );

            res.json({
                success: true,
                summary
            });
        } catch (error) {
            console.error('Error generating context summary:', error);
            res.status(500).json({ error: 'Failed to generate context summary' });
        }
    };

    /**
     * Store an AI query and response
     * POST /api/ai-context/query
     */
    storeAIQuery = async (req: Request, res: Response): Promise<void> => {
        try {
            const { query, response, confidence, queryType, gameId, userId, context } = req.body;

            if (!query || !response || confidence === undefined) {
                res.status(400).json({ error: 'Query, response, and confidence are required' });
                return;
            }

            const queryId = await this.contextManager.storeAIQuery(
                query,
                response,
                confidence,
                queryType,
                gameId,
                userId,
                context
            );

            res.status(201).json({
                success: true,
                queryId,
                message: 'AI query stored successfully'
            });
        } catch (error) {
            console.error('Error storing AI query:', error);
            res.status(500).json({ error: 'Failed to store AI query' });
        }
    };

    /**
     * Store an AI insight
     * POST /api/ai-context/insight
     */
    storeInsight = async (req: Request, res: Response): Promise<void> => {
        try {
            const { title, description, type, confidence, gameId, queryId, dateRange, metrics, metadata } = req.body;

            if (!title || !description || !type || confidence === undefined) {
                res.status(400).json({ error: 'Title, description, type, and confidence are required' });
                return;
            }

            const insightId = await this.contextManager.storeInsight(
                title,
                description,
                type,
                confidence,
                gameId,
                queryId,
                dateRange,
                metrics,
                metadata
            );

            res.status(201).json({
                success: true,
                insightId,
                message: 'AI insight stored successfully'
            });
        } catch (error) {
            console.error('Error storing AI insight:', error);
            res.status(500).json({ error: 'Failed to store AI insight' });
        }
    };

    /**
     * Get recent insights
     * GET /api/ai-context/insights?gameId=optional&limit=10
     */
    getRecentInsights = async (req: Request, res: Response): Promise<void> => {
        try {
            const { gameId, limit } = req.query;

            const insights = await this.contextManager.getRecentInsights(
                gameId as string | undefined,
                limit ? parseInt(limit as string) : 10
            );

            res.json({
                success: true,
                data: insights
            });
        } catch (error) {
            console.error('Error getting recent insights:', error);
            res.status(500).json({ error: 'Failed to get insights' });
        }
    };
}