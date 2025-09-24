import { PrismaClient } from '@prisma/client';
import { ConfigRequest } from '../types/api';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export class RemoteConfigService {
    // Get configs for a game
    async getConfigs(gameId: string, request: ConfigRequest) {
        try {
            const environment = request.environment || 'production';

            const whereClause: any = {
                gameId: gameId,
                environment: environment,
                enabled: true
            };

            // If specific keys requested, filter by them
            if (request.keys && request.keys.length > 0) {
                whereClause.key = {
                    in: request.keys
                };
            }

            const configs = await prisma.remoteConfig.findMany({
                where: whereClause,
                select: {
                    key: true,
                    value: true,
                    updatedAt: true
                }
            });

            // Convert to key-value object
            const configObject = configs.reduce((acc: any, config: any) => {
                acc[config.key] = config.value;
                return acc;
            }, {});

            // Add metadata
            const result = {
                configs: configObject,
                environment: environment,
                lastUpdated: configs.length > 0
                    ? Math.max(...configs.map((c: any) => c.updatedAt.getTime()))
                    : Date.now()
            };

            logger.info(`Retrieved ${configs.length} configs for game ${gameId}, env: ${environment}`);
            return result;
        } catch (error) {
            logger.error('Error getting remote configs:', error);
            throw error;
        }
    }

    // Create or update config
    async setConfig(gameId: string, key: string, value: any, environment: string = 'production', description?: string) {
        try {
            const config = await prisma.remoteConfig.upsert({
                where: {
                    gameId_key_environment: {
                        gameId: gameId,
                        key: key,
                        environment: environment
                    }
                },
                update: {
                    value: value,
                    description: description,
                    updatedAt: new Date()
                },
                create: {
                    gameId: gameId,
                    key: key,
                    value: value,
                    environment: environment,
                    description: description,
                    enabled: true
                }
            });

            logger.info(`Config ${key} set for game ${gameId}, env: ${environment}`);
            return config;
        } catch (error) {
            logger.error('Error setting remote config:', error);
            throw error;
        }
    }

    // Delete config
    async deleteConfig(gameId: string, key: string, environment: string = 'production') {
        try {
            const config = await prisma.remoteConfig.delete({
                where: {
                    gameId_key_environment: {
                        gameId: gameId,
                        key: key,
                        environment: environment
                    }
                }
            });

            logger.info(`Config ${key} deleted for game ${gameId}, env: ${environment}`);
            return config;
        } catch (error) {
            logger.error('Error deleting remote config:', error);
            throw error;
        }
    }

    // Toggle config enabled/disabled
    async toggleConfig(gameId: string, key: string, environment: string = 'production') {
        try {
            const config = await prisma.remoteConfig.findUnique({
                where: {
                    gameId_key_environment: {
                        gameId: gameId,
                        key: key,
                        environment: environment
                    }
                }
            });

            if (!config) {
                throw new Error('Config not found');
            }

            const updatedConfig = await prisma.remoteConfig.update({
                where: {
                    gameId_key_environment: {
                        gameId: gameId,
                        key: key,
                        environment: environment
                    }
                },
                data: {
                    enabled: !config.enabled,
                    updatedAt: new Date()
                }
            });

            logger.info(`Config ${key} toggled to ${updatedConfig.enabled} for game ${gameId}`);
            return updatedConfig;
        } catch (error) {
            logger.error('Error toggling remote config:', error);
            throw error;
        }
    }

    // List all configs for dashboard
    async listConfigs(gameId: string, environment?: string) {
        try {
            const whereClause: any = { gameId: gameId };

            if (environment) {
                whereClause.environment = environment;
            }

            const configs = await prisma.remoteConfig.findMany({
                where: whereClause,
                orderBy: [
                    { environment: 'asc' },
                    { key: 'asc' }
                ]
            });

            logger.info(`Listed ${configs.length} configs for game ${gameId}`);
            return configs;
        } catch (error) {
            logger.error('Error listing remote configs:', error);
            throw error;
        }
    }
}