import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../types/api';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export class GameController {
    // Create a new game
    async createGame(req: Request, res: Response<ApiResponse>) {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Game name is required'
                });
            }

            // Generate a unique API key
            const apiKey = `lvl_${uuidv4().replace(/-/g, '')}`;

            const game = await prisma.game.create({
                data: {
                    name,
                    description,
                    apiKey
                }
            });

            logger.info(`Game created: ${name} (${game.id})`);

            res.status(201).json({
                success: true,
                data: {
                    id: game.id,
                    name: game.name,
                    apiKey: game.apiKey,
                    createdAt: game.createdAt
                }
            });
        } catch (error) {
            logger.error('Error in createGame:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create game'
            });
        }
    }

    // List all games
    async listGames(req: Request, res: Response<ApiResponse>) {
        try {
            const games = await prisma.game.findMany({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    createdAt: true,
                    _count: {
                        select: {
                            events: true,
                            users: true,
                            sessions: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            const formattedGames = games.map((game: any) => ({
                id: game.id,
                name: game.name,
                description: game.description,
                createdAt: game.createdAt,
                stats: {
                    events: game._count.events,
                    users: game._count.users,
                    sessions: game._count.sessions
                }
            }));

            res.status(200).json({
                success: true,
                data: formattedGames
            });
        } catch (error) {
            logger.error('Error in listGames:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list games'
            });
        }
    }

    // Get game details
    async getGame(req: Request, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            const game = await prisma.game.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    apiKey: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: {
                            events: true,
                            users: true,
                            sessions: true
                        }
                    }
                }
            });

            if (!game) {
                return res.status(404).json({
                    success: false,
                    error: 'Game not found'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    ...game,
                    stats: {
                        events: game._count.events,
                        users: game._count.users,
                        sessions: game._count.sessions
                    }
                }
            });
        } catch (error) {
            logger.error('Error in getGame:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get game details'
            });
        }
    }

    // Regenerate API key
    async regenerateApiKey(req: Request, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            // Generate a new API key
            const apiKey = `lvl_${uuidv4().replace(/-/g, '')}`;

            const game = await prisma.game.update({
                where: { id },
                data: { apiKey }
            });

            logger.info(`API key regenerated for game: ${game.name} (${game.id})`);

            res.status(200).json({
                success: true,
                data: {
                    id: game.id,
                    name: game.name,
                    apiKey: game.apiKey
                }
            });
        } catch (error) {
            logger.error('Error in regenerateApiKey:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to regenerate API key'
            });
        }
    }

    // Delete game
    async deleteGame(req: Request, res: Response<ApiResponse>) {
        try {
            const { id } = req.params;

            await prisma.game.delete({
                where: { id }
            });

            logger.info(`Game deleted: ${id}`);

            res.status(200).json({
                success: true,
                message: 'Game deleted successfully'
            });
        } catch (error) {
            logger.error('Error in deleteGame:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete game'
            });
        }
    }
}