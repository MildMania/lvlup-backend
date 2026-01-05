import { Request, Response } from 'express';
import { PrismaClient, Game } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../types/api';
import logger from '../utils/logger';

// Types for Prisma return values with counts
interface GameWithCounts {
    id: string;
    name: string;
    description?: string | null;
    apiKey?: string;
    createdAt: Date;
    updatedAt?: Date;
    _count?: {
        events: number;
        users: number;
        sessions: number;
        checkpoints?: number;
        playerCheckpoints?: number;
    };
}

// Create PrismaClient with type assertion to avoid the type errors
const prisma = new PrismaClient() as any;

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

            // Check if game with same name already exists
            const existingGame = await prisma.game.findFirst({
                where: {
                    name: {
                        equals: name,
                        mode: 'insensitive' // Case-insensitive comparison
                    }
                }
            });

            if (existingGame) {
                return res.status(409).json({
                    success: false,
                    error: `Game with name "${name}" already exists. Please choose a different name.`
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
                    description: game.description,
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
                    apiKey: true, // Include API key for frontend
                    createdAt: true,
                    _count: {
                        select: {
                            events: true,
                            users: true,
                            sessions: true,
                            checkpoints: true,
                            playerCheckpoints: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            const formattedGames = games.map((game: GameWithCounts) => ({
                id: game.id,
                name: game.name,
                description: game.description,
                apiKey: game.apiKey, // Include in response
                createdAt: game.createdAt,
                stats: {
                    events: game._count?.events || 0,
                    users: game._count?.users || 0,
                    sessions: game._count?.sessions || 0,
                    checkpoints: game._count?.checkpoints || 0,
                    playerJourneys: game._count?.playerCheckpoints || 0
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

            // Ensure id is defined
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Game ID is required'
                });
            }

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
                            sessions: true,
                            checkpoints: true,
                            playerCheckpoints: true
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

            // Cast to our interface
            const gameWithCounts = game as GameWithCounts;

            res.status(200).json({
                success: true,
                data: {
                    ...gameWithCounts,
                    stats: {
                        events: gameWithCounts._count?.events || 0,
                        users: gameWithCounts._count?.users || 0,
                        sessions: gameWithCounts._count?.sessions || 0,
                        checkpoints: gameWithCounts._count?.checkpoints || 0,
                        playerJourneys: gameWithCounts._count?.playerCheckpoints || 0
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

            // Ensure id is defined
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Game ID is required'
                });
            }

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

            // Ensure id is defined
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'Game ID is required'
                });
            }

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