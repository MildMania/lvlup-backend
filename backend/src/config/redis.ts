/**
 * Redis Cache Configuration
 * Initializes and manages Redis client for config caching
 */

import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis connection
 * @returns Promise resolving when connected
 */
export async function initRedis(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  try {
    const client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 50, 500),
      },
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
}

/**
 * Get Redis client instance
 * @returns Redis client or null if not initialized
 */
export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * Check if Redis is available
 * @returns true if Redis client is connected
 */
export function isRedisAvailable(): boolean {
  return redisClient !== null && redisClient.isReady;
}

/**
 * Disconnect Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
  }
}

/**
 * Health check for Redis
 * @returns true if Redis is healthy, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    if (!redisClient) {
      return false;
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

