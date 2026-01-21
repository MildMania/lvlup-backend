/**
 * Cache Service
 * Provides Redis-based caching abstraction for remote configs
 */

import { getRedisClient, isRedisAvailable } from '../config/redis';
import logger from '../utils/logger';
import { CacheKeyComponents, CachedConfigData } from '../types/config.types';

// Cache TTL constants (in seconds)
export const CACHE_TTL_DEFAULT = 5 * 60; // 5 minutes
export const CACHE_TTL_SHORT = 1 * 60; // 1 minute for validation errors
export const CACHE_TTL_LONG = 24 * 60 * 60; // 24 hours for rarely changing data

/**
 * Generates a cache key from components
 * Cache key structure: config:{gameId}:{environment}:{platform}:{version}:{country}:{segment}
 * @param components Cache key components
 * @returns Redis cache key
 */
export function generateCacheKey(components: Partial<CacheKeyComponents>): string {
  const {
    gameId,
    environment = 'production',
    platform,
    version,
    country,
    segment,
  } = components;

  if (!gameId) {
    throw new Error('gameId is required for cache key generation');
  }

  const parts = ['config', gameId, environment];

  if (platform) parts.push(platform);
  if (version) parts.push(version);
  if (country) parts.push(country);
  if (segment) parts.push(segment);

  return parts.join(':');
}

/**
 * Generates a pattern for cache invalidation
 * Pattern: config:{gameId}:{environment}:*
 * @param gameId Game ID
 * @param environment Environment (optional)
 * @returns Redis pattern for matching keys
 */
export function generateCachePattern(gameId: string, environment?: string): string {
  if (!environment) {
    return `config:${gameId}:*`;
  }
  return `config:${gameId}:${environment}:*`;
}

/**
 * Sets a value in cache
 * @param key Cache key
 * @param value Value to cache
 * @param ttl Time to live in seconds
 * @returns true if successful, false if Redis unavailable
 */
export async function setCacheValue(
  key: string,
  value: unknown,
  ttl: number = CACHE_TTL_DEFAULT
): Promise<boolean> {
  try {
    if (!isRedisAvailable()) {
      logger.debug('Redis unavailable, skipping cache set');
      return false;
    }

    const redis = getRedisClient();
    if (!redis) return false;

    const serialized = JSON.stringify(value);
    await redis.setEx(key, ttl, serialized);

    logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    logger.error('Cache set failed:', { key, error });
    return false;
  }
}

/**
 * Gets a value from cache
 * @param key Cache key
 * @returns Cached value or null if not found/Redis unavailable
 */
export async function getCacheValue<T = unknown>(key: string): Promise<T | null> {
  try {
    if (!isRedisAvailable()) {
      logger.debug('Redis unavailable, skipping cache get');
      return null;
    }

    const redis = getRedisClient();
    if (!redis) return null;

    const cached = await redis.get(key);
    if (!cached) {
      logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    logger.debug(`Cache HIT: ${key}`);
    return JSON.parse(cached) as T;
  } catch (error) {
    logger.error('Cache get failed:', { key, error });
    return null;
  }
}

/**
 * Deletes a value from cache
 * @param key Cache key
 * @returns true if successful, false if Redis unavailable
 */
export async function deleteCacheValue(key: string): Promise<boolean> {
  try {
    if (!isRedisAvailable()) {
      logger.debug('Redis unavailable, skipping cache delete');
      return false;
    }

    const redis = getRedisClient();
    if (!redis) return false;

    await redis.del(key);
    logger.debug(`Cache DELETE: ${key}`);
    return true;
  } catch (error) {
    logger.error('Cache delete failed:', { key, error });
    return false;
  }
}

/**
 * Invalidates cache by pattern matching
 * Useful for invalidating all variations of a config when it's updated
 * @param pattern Redis pattern (e.g., "config:gameId:*")
 * @returns Number of keys deleted, or -1 if Redis unavailable
 */
export async function invalidateCachePattern(pattern: string): Promise<number> {
  try {
    if (!isRedisAvailable()) {
      logger.debug('Redis unavailable, skipping cache invalidation');
      return -1;
    }

    const redis = getRedisClient();
    if (!redis) return -1;

    // Scan for keys matching pattern and delete them
    let cursor = 0;
    let deletedCount = 0;

    do {
      const result = await redis.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = result.cursor;
      const keys = result.keys;

      if (keys.length > 0) {
        deletedCount += await redis.del(keys);
      }
    } while (cursor !== 0);

    logger.debug(`Cache INVALIDATE pattern: ${pattern} (deleted: ${deletedCount} keys)`);
    return deletedCount;
  } catch (error) {
    logger.error('Cache pattern invalidation failed:', { pattern, error });
    return -1;
  }
}

/**
 * Invalidates all cache for a specific game and environment
 * @param gameId Game ID
 * @param environment Environment (optional, defaults to all)
 * @returns Number of keys deleted
 */
export async function invalidateGameCache(
  gameId: string,
  environment?: string
): Promise<number> {
  const pattern = generateCachePattern(gameId, environment);
  return invalidateCachePattern(pattern);
}

/**
 * Gets TTL of a cached key
 * @param key Cache key
 * @returns TTL in seconds, -1 if key doesn't exist, -2 if no expiry, null if Redis unavailable
 */
export async function getCacheTTL(key: string): Promise<number | null> {
  try {
    if (!isRedisAvailable()) {
      return null;
    }

    const redis = getRedisClient();
    if (!redis) return null;

    const ttl = await redis.ttl(key);
    return ttl;
  } catch (error) {
    logger.error('Cache TTL check failed:', { key, error });
    return null;
  }
}

/**
 * Checks if a key exists in cache
 * @param key Cache key
 * @returns true if key exists, false otherwise
 */
export async function cacheKeyExists(key: string): Promise<boolean> {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const redis = getRedisClient();
    if (!redis) return false;

    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Cache exists check failed:', { key, error });
    return false;
  }
}

/**
 * Clears all cache (DANGEROUS - use with caution)
 * @returns true if successful
 */
export async function clearAllCache(): Promise<boolean> {
  try {
    if (!isRedisAvailable()) {
      logger.debug('Redis unavailable, skipping cache clear');
      return false;
    }

    const redis = getRedisClient();
    if (!redis) return false;

    await redis.flushDb();
    logger.warn('Cache CLEARED (all keys deleted)');
    return true;
  } catch (error) {
    logger.error('Cache clear failed:', error);
    return false;
  }
}

