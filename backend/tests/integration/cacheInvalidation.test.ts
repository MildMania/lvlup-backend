/**
 * Integration Tests for Cache Invalidation
 * Phase 3: User Story 1 - Cache invalidation on config updates
 * Tasks: T044
 */

import * as cacheService from '../../src/services/cacheService';
import * as configService from '../../src/services/configService';
import { PrismaClient } from '@prisma/client';

// Mock Redis for these tests
jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(),
  isRedisAvailable: jest.fn(() => true),
  initRedis: jest.fn(),
}));

describe('Cache Invalidation on Config Updates', () => {
  const prisma = new PrismaClient();
  const TEST_GAME_ID = 'test_game_cache_' + Date.now();

  beforeAll(async () => {
    // Setup: Create test game if needed
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  describe('Cache invalidation patterns', () => {
    it('should generate correct cache key', () => {
      const key = cacheService.generateCacheKey({
        gameId: TEST_GAME_ID,
        environment: 'production',
        platform: 'iOS',
        version: '3.5.0',
        country: 'US',
      });

      expect(key).toBe(
        `config:${TEST_GAME_ID}:production:iOS:3.5.0:US`
      );
    });

    it('should generate correct cache pattern for invalidation', () => {
      const pattern = cacheService.generateCachePattern(
        TEST_GAME_ID,
        'production'
      );

      expect(pattern).toBe(`config:${TEST_GAME_ID}:production:*`);
    });

    it('should generate pattern for all environments', () => {
      const pattern = cacheService.generateCachePattern(TEST_GAME_ID);

      expect(pattern).toBe(`config:${TEST_GAME_ID}:*`);
    });
  });

  describe('Cache invalidation on config create', () => {
    it('should invalidate cache when config is created', async () => {
      const invalidateSpy = jest.spyOn(
        cacheService,
        'invalidateGameCache'
      );

      try {
        await configService.createConfig(
          {
            gameId: TEST_GAME_ID,
            key: 'test_cache_create_' + Date.now(),
            value: 100,
            dataType: 'number',
            environment: 'production',
          },
          'test_user'
        );

        // Verify cache invalidation was called
        expect(invalidateSpy).toHaveBeenCalledWith(
          TEST_GAME_ID,
          'production'
        );
      } finally {
        invalidateSpy.mockRestore();
      }
    });
  });

  describe('Cache invalidation on config update', () => {
    it('should invalidate cache when config is updated', async () => {
      // Create a config first
      const config = await configService.createConfig(
        {
          gameId: TEST_GAME_ID,
          key: 'test_cache_update_' + Date.now(),
          value: 100,
          dataType: 'number',
          environment: 'production',
        },
        'test_user'
      );

      const invalidateSpy = jest.spyOn(
        cacheService,
        'invalidateGameCache'
      );

      try {
        // Update the config
        await configService.updateConfig(
          config.id,
          {
            value: 200,
          },
          'test_user'
        );

        // Verify cache invalidation was called
        expect(invalidateSpy).toHaveBeenCalledWith(
          TEST_GAME_ID,
          'production'
        );
      } finally {
        invalidateSpy.mockRestore();
      }
    });
  });

  describe('Cache invalidation on config delete', () => {
    it('should invalidate cache when config is deleted', async () => {
      // Create a config first
      const config = await configService.createConfig(
        {
          gameId: TEST_GAME_ID,
          key: 'test_cache_delete_' + Date.now(),
          value: 100,
          dataType: 'number',
          environment: 'production',
        },
        'test_user'
      );

      const invalidateSpy = jest.spyOn(
        cacheService,
        'invalidateGameCache'
      );

      try {
        // Delete the config
        await configService.deleteConfig(config.id, 'test_user');

        // Verify cache invalidation was called
        expect(invalidateSpy).toHaveBeenCalledWith(
          TEST_GAME_ID,
          'production'
        );
      } finally {
        invalidateSpy.mockRestore();
      }
    });
  });

  describe('Multi-environment cache invalidation', () => {
    it('should correctly invalidate caches across different contexts', () => {
      // Create cache keys with different contexts
      const keys = [
        cacheService.generateCacheKey({
          gameId: TEST_GAME_ID,
          environment: 'production',
          platform: 'iOS',
          version: '3.5.0',
        }),
        cacheService.generateCacheKey({
          gameId: TEST_GAME_ID,
          environment: 'production',
          platform: 'Android',
          version: '2.0.0',
        }),
        cacheService.generateCacheKey({
          gameId: TEST_GAME_ID,
          environment: 'production',
          platform: 'Web',
        }),
      ];

      // All keys should match the invalidation pattern
      const pattern = cacheService.generateCachePattern(
        TEST_GAME_ID,
        'production'
      );

      keys.forEach((key) => {
        const regex = new RegExp(
          '^' + pattern.replace('*', '.*') + '$'
        );
        expect(regex.test(key)).toBe(true);
      });
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

  describe('Cache key components', () => {
    it('should include all context dimensions in cache key', () => {
      const key = cacheService.generateCacheKey({
        gameId: 'game_123',
        environment: 'production',
        platform: 'iOS',
        version: '1.0.0',
        country: 'US',
        segment: 'premium_users',
      });

      expect(key).toContain('game_123');
      expect(key).toContain('production');
      expect(key).toContain('iOS');
      expect(key).toContain('1.0.0');
      expect(key).toContain('US');
      expect(key).toContain('premium_users');
    });

    it('should use default environment if not provided', () => {
      const key = cacheService.generateCacheKey({
        gameId: 'game_123',
      });

      expect(key).toContain('production');
    });

    it('should handle optional context fields', () => {
      const key = cacheService.generateCacheKey({
        gameId: 'game_123',
        environment: 'staging',
        platform: 'iOS',
        // Other fields optional
      });

      expect(key).toContain('game_123');
      expect(key).toContain('staging');
      expect(key).toContain('iOS');
      expect(key).not.toContain(':undefined');
    });
  });

  describe('Error scenarios', () => {
    it('should throw error if gameId is missing', () => {
      expect(() => {
        cacheService.generateCacheKey({
          gameId: '',
          environment: 'production',
        });
      }).toThrow();
    });

    it('should not throw for missing optional fields', () => {
      expect(() => {
        cacheService.generateCacheKey({
          gameId: 'game_123',
        });
      }).not.toThrow();
    });
  });
});

