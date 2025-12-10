import { PrismaClient } from '@prisma/client';
import { AnalyticsFilterParams } from '../types/api';
import logger from '../utils/logger';

// Create PrismaClient with type assertion
const prisma = new PrismaClient() as any;

// Types for Checkpoint Management
export interface CheckpointData {
    id?: string;
    name: string;
    description?: string;
    type: string; // e.g., "tutorial", "level", "achievement"
    tags?: string[];
    order?: number;
}

export interface PlayerCheckpointData {
    id?: string;
    userId: string;
    checkpointId: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
}

// Types for Journey Analysis
export interface CheckpointProgressData {
    id: string;
    name: string;
    count: number;
    percentage: number;
    avgTimeToReach: number; // seconds from first checkpoint or install
}

export interface JourneyProgressData {
    totalUsers: number;
    checkpoints: CheckpointProgressData[];
}

export interface UserJourneyData {
    userId: string;
    checkpoints: {
        id: string;
        name: string;
        timestamp: string;
        metadata?: Record<string, any>;
    }[];
}

// Parameters for Journey Analytics
export interface JourneyAnalyticsParams extends AnalyticsFilterParams {
    checkpointType?: string | string[];
    tags?: string | string[];
    format?: 'funnel' | 'timeline' | 'completion';
}

/**
 * Service for player journey analytics
 */
export class PlayerJourneyService {
    private prisma: any;

    constructor(prismaClient?: any) {
        this.prisma = prismaClient || prisma;
    }
    /**
     * Create a new checkpoint definition
     * @param gameId The game ID
     * @param checkpointData Checkpoint data
     */
    async createCheckpoint(gameId: string, checkpointData: CheckpointData): Promise<CheckpointData> {
        try {
            const checkpoint = await this.prisma.checkpoint.create({
                data: {
                    gameId,
                    name: checkpointData.name,
                    description: checkpointData.description,
                    type: checkpointData.type,
                    tags: checkpointData.tags || [],
                    order: checkpointData.order
                }
            });

            logger.info(`Created checkpoint ${checkpoint.name} for game ${gameId}`);
            return checkpoint;
        } catch (error) {
            logger.error('Error creating checkpoint:', error);
            throw error;
        }
    }

    /**
     * Record a player reaching a checkpoint
     * @param gameId The game ID
     * @param playerCheckpointData Player checkpoint data
     */
    async recordPlayerCheckpoint(gameId: string, playerCheckpointData: PlayerCheckpointData): Promise<PlayerCheckpointData> {
        try {
            // Check if the user has already reached this checkpoint
            const existingRecord = await this.prisma.playerCheckpoint.findUnique({
                where: {
                    userId_checkpointId: {
                        userId: playerCheckpointData.userId,
                        checkpointId: playerCheckpointData.checkpointId
                    }
                }
            });

            // If already reached, don't record again (or update if needed)
            if (existingRecord) {
                logger.info(`User ${playerCheckpointData.userId} already reached checkpoint ${playerCheckpointData.checkpointId}`);
                return existingRecord;
            }

            // Record new checkpoint achievement
            const playerCheckpoint = await this.prisma.playerCheckpoint.create({
                data: {
                    gameId,
                    userId: playerCheckpointData.userId,
                    checkpointId: playerCheckpointData.checkpointId,
                    timestamp: playerCheckpointData.timestamp || new Date(),
                    metadata: playerCheckpointData.metadata || {}
                }
            });

            logger.info(`Recorded checkpoint ${playerCheckpointData.checkpointId} for user ${playerCheckpointData.userId}`);
            return playerCheckpoint;
        } catch (error) {
            logger.error('Error recording player checkpoint:', error);
            throw error;
        }
    }

    /**
     * Get journey progress analytics
     * @param gameId The game ID
     * @param startDate Start date for analysis
     * @param endDate End date for analysis
     * @param filters Optional filters
     */
    async getJourneyProgress(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: JourneyAnalyticsParams
    ): Promise<JourneyProgressData> {
        try {
            // Build checkpoint filters
            const checkpointFilters: any = { gameId };

            // Apply type filter if specified
            if (filters?.checkpointType) {
                checkpointFilters.type = Array.isArray(filters.checkpointType)
                    ? { in: filters.checkpointType }
                    : filters.checkpointType;
            }

            // Apply tag filters if specified
            if (filters?.tags) {
                const tagArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
                // This assumes tags is stored as a string array in the database
                // For each tag, we check if it exists in the checkpoint's tags array
                checkpointFilters.tags = {
                    hasSome: tagArray
                };
            }

            // Get all matching checkpoints for the game
            const checkpoints = await this.prisma.checkpoint.findMany({
                where: checkpointFilters,
                orderBy: {
                    order: 'asc' // Order by the checkpoint's specified order if available
                }
            });

            if (checkpoints.length === 0) {
                return {
                    totalUsers: 0,
                    checkpoints: []
                };
            }

            // Build player checkpoint filters with proper date handling
            const playerCheckpointFilters: any = {
                gameId,
                timestamp: {
                    gte: startDate,
                    lte: endDate
                }
            };

            // Get user filters for additional filtering
            const userFilters: any = {};

            if (filters?.country) {
                userFilters.country = Array.isArray(filters.country)
                    ? { in: filters.country }
                    : filters.country;
            }

            if (filters?.platform) {
                userFilters.platform = Array.isArray(filters.platform)
                    ? { in: filters.platform }
                    : filters.platform;
            }

            if (filters?.version) {
                userFilters.version = Array.isArray(filters.version)
                    ? { in: filters.version }
                    : filters.version;
            }

            // Count NEW users in this period (registered during the date range)
            // Player journey should track new user onboarding, not all active users
            // Apply same filters as will be used for checkpoint queries
            const totalNewUsers = await this.prisma.user.count({
                where: {
                    gameId,
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    },
                    ...userFilters
                }
            });

            // If we have user filters, include them in the checkpoint filters
            if (Object.keys(userFilters).length > 0) {
                playerCheckpointFilters.user = userFilters;
            }

            // Calculate journey progress for each checkpoint
            const checkpointProgress: CheckpointProgressData[] = [];

            for (const checkpoint of checkpoints) {
                // Find all users who reached this checkpoint AND were registered during the date range
                const usersReached = await this.prisma.playerCheckpoint.findMany({
                    where: {
                        ...playerCheckpointFilters,
                        checkpointId: checkpoint.id,
                        user: {
                            ...userFilters,
                            createdAt: {
                                gte: startDate,
                                lte: endDate
                            }
                        }
                    },
                    select: {
                        userId: true,
                        timestamp: true
                    }
                });

                // Count of NEW users who reached this checkpoint
                const count = usersReached.length;

                // Calculate percentage based on total new users
                const percentage = totalNewUsers > 0
                    ? (count / totalNewUsers) * 100
                    : 0;

                // Calculate average time to reach from the start of the period
                // This is simplified - in a real implementation you might want to
                // calculate time from first checkpoint or from install
                let avgTimeToReach = 0;
                if (count > 0) {
                    const totalTimeToReach = usersReached.reduce((sum: number, record: any) => {
                        // Calculate seconds from start of period
                        const checkpointTime = new Date(record.timestamp).getTime();
                        const startTime = startDate.getTime();
                        const secondsToReach = (checkpointTime - startTime) / 1000;
                        return sum + secondsToReach;
                    }, 0);
                    avgTimeToReach = Math.round(totalTimeToReach / count);
                }

                // Add to results
                checkpointProgress.push({
                    id: checkpoint.id,
                    name: checkpoint.name,
                    count,
                    percentage: parseFloat(percentage.toFixed(2)),
                    avgTimeToReach
                });
            }

            const journeyData: JourneyProgressData = {
                totalUsers: totalNewUsers,
                checkpoints: checkpointProgress
            };

            logger.info(`Generated journey progress data for game ${gameId}`);
            return journeyData;
        } catch (error) {
            logger.error('Error getting journey progress:', error);
            throw error;
        }
    }

    /**
     * Get journey data for a specific user
     * @param gameId The game ID
     * @param userId The user ID
     */
    async getUserJourney(gameId: string, userId: string): Promise<UserJourneyData> {
        try {
            // Get all checkpoints reached by this user
            const playerCheckpoints = await this.prisma.playerCheckpoint.findMany({
                where: {
                    gameId,
                    userId
                },
                include: {
                    checkpoint: true
                },
                orderBy: {
                    timestamp: 'asc'
                }
            });

            // Format the journey data
            const userJourney: UserJourneyData = {
                userId,
                checkpoints: playerCheckpoints.map((pc: any) => ({
                    id: pc.checkpointId,
                    name: pc.checkpoint?.name || 'Unknown Checkpoint',
                    timestamp: pc.timestamp.toISOString(),
                    metadata: pc.metadata as Record<string, any>
                }))
            };

            logger.info(`Retrieved journey for user ${userId} in game ${gameId}`);
            return userJourney;
        } catch (error) {
            logger.error('Error getting user journey:', error);
            throw error;
        }
    }
}