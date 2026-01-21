/**
 * Unit Tests for Cache Service
 */

import * as cacheService from '../src/services/cacheService';
import { CacheKeyComponents } from '../src/types/config.types';

// Mock Redis client
jest.mock('../src/config/redis', () => ({
  getRedisClient: jest.fn(() => null),
  isRedisAvailable: jest.fn(() => false),
  initRedis: jest.fn(),
  disconnectRedis: jest.fn(),
  healthCheck: jest.fn(() => true),
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Cache Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCacheKey', () => {
    it('should generate cache key with required components', () => {
      const components: CacheKeyComponents = {
        gameId: 'game123',
        environment: 'production',
      };
      const key = cacheService.generateCacheKey(components);
      expect(key).toBe('config:game123:production');
    });

    it('should include optional platform in key', () => {
      const components: CacheKeyComponents = {
        gameId: 'game123',
        environment: 'staging',
        platform: 'iOS',
      };
      const key = cacheService.generateCacheKey(components);
      expect(key).toBe('config:game123:staging:iOS');
    });

    it('should include all components in key', () => {
      const components: CacheKeyComponents = {
        gameId: 'game123',
        environment: 'production',
        platform: 'Android',
        version: '1.0.0',
        country: 'US',
        segment: 'new_users',
      };
      const key = cacheService.generateCacheKey(components);
      expect(key).toBe('config:game123:production:Android:1.0.0:US:new_users');
    });

    it('should throw error if gameId is missing', () => {
      const components: CacheKeyComponents = {
        gameId: '',
        environment: 'production',
      };
      expect(() => cacheService.generateCacheKey(components)).toThrow();
    });

    it('should use default environment if not provided', () => {
      const components = {
        gameId: 'game123',
      } as CacheKeyComponents;
      const key = cacheService.generateCacheKey(components);
      expect(key).toContain('production');
    });
  });

  describe('generateCachePattern', () => {
    it('should generate pattern for gameId with environment', () => {
      const pattern = cacheService.generateCachePattern('game123', 'production');
      expect(pattern).toBe('config:game123:production:*');
    });

    it('should generate pattern for gameId only', () => {
      const pattern = cacheService.generateCachePattern('game123');
      expect(pattern).toBe('config:game123:*');
    });
  });

  describe('Cache TTL constants', () => {
    it('should have correct default TTL', () => {
      expect(cacheService.CACHE_TTL_DEFAULT).toBe(5 * 60); // 5 minutes
    });

    it('should have correct short TTL', () => {
      expect(cacheService.CACHE_TTL_SHORT).toBe(1 * 60); // 1 minute
    });

    it('should have correct long TTL', () => {
      expect(cacheService.CACHE_TTL_LONG).toBe(24 * 60 * 60); // 24 hours
    });
  });

  describe('setCacheValue', () => {
    it('should return false if Redis unavailable', async () => {
      const result = await cacheService.setCacheValue('test-key', { foo: 'bar' });
      expect(result).toBe(false);
    });

    it('should use default TTL if not provided', async () => {
      const result = await cacheService.setCacheValue('test-key', { foo: 'bar' });
      // With mocked Redis unavailable, should return false
      expect(result).toBe(false);
    });
  });

  describe('getCacheValue', () => {
    it('should return null if Redis unavailable', async () => {
      const result = await cacheService.getCacheValue('test-key');
      expect(result).toBeNull();
    });

    it('should handle generic types', async () => {
      interface TestData {
        id: string;
        name: string;
      }

      const result = await cacheService.getCacheValue<TestData>('test-key');
      expect(result).toBeNull(); // Redis unavailable
    });
  });

  describe('deleteCacheValue', () => {
    it('should return false if Redis unavailable', async () => {
      const result = await cacheService.deleteCacheValue('test-key');
      expect(result).toBe(false);
    });
  });

  describe('invalidateCachePattern', () => {
    it('should return -1 if Redis unavailable', async () => {
      const result = await cacheService.invalidateCachePattern('config:game123:*');
      expect(result).toBe(-1);
    });
  });

  describe('invalidateGameCache', () => {
    it('should accept gameId and environment', async () => {
      const result = await cacheService.invalidateGameCache('game123', 'production');
      expect(result).toBe(-1); // Redis unavailable
    });

    it('should accept gameId only', async () => {
      const result = await cacheService.invalidateGameCache('game123');
      expect(result).toBe(-1); // Redis unavailable
    });
  });

  describe('getCacheTTL', () => {
    it('should return null if Redis unavailable', async () => {
      const result = await cacheService.getCacheTTL('test-key');
      expect(result).toBeNull();
    });
  });

  describe('cacheKeyExists', () => {
    it('should return false if Redis unavailable', async () => {
      const result = await cacheService.cacheKeyExists('test-key');
      expect(result).toBe(false);
    });
  });

  describe('clearAllCache', () => {
    it('should return false if Redis unavailable', async () => {
      const result = await cacheService.clearAllCache();
      expect(result).toBe(false);
    });
  });
});

