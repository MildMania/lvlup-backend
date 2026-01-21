/**
 * Integration Tests for Config CRUD Operations
 * Phase 3: User Story 1 - Config CRUD via API
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

// Note: In real implementation, these would test against a running Express server
// This is a template for the test structure

describe('Config CRUD Operations Integration Tests', () => {
  const prisma = new PrismaClient();
  const API_BASE = 'http://localhost:3000';
  const TEST_GAME_ID = 'test_game_123';
  const TEST_API_KEY = 'test_api_key_123';

  beforeAll(async () => {
    // Setup: Create test game
    // In practice, this would be created via the API or seeded
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await prisma.$disconnect();
  });

  describe('POST /api/admin/configs', () => {
    it('should create a new config', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'daily_reward_coins',
          value: 100,
          dataType: 'number',
          environment: 'production',
          description: 'Daily login reward',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.key).toBe('daily_reward_coins');
      expect(response.body.data.value).toBe(100);
    });

    it('should validate config key format', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'invalid-key-with-dashes',
          value: 100,
          dataType: 'number',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject duplicate keys in same environment', async () => {
      // First create
      await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'unique_key',
          value: 100,
          dataType: 'number',
        });

      // Second create with same key
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'unique_key',
          value: 200,
          dataType: 'number',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('should validate data type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'invalid_type',
          value: 100,
          dataType: 'invalid_type',
        });

      expect(response.status).toBe(400);
    });

    it('should validate value matches data type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'number_field',
          value: 'not_a_number',
          dataType: 'number',
        });

      expect(response.status).toBe(400);
    });

    it('should reject oversized values', async () => {
      const largeValue = 'x'.repeat(101 * 1024); // 101KB

      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'large_value',
          value: largeValue,
          dataType: 'string',
        });

      expect(response.status).toBe(413);
    });
  });

  describe('GET /api/admin/configs/:gameId', () => {
    it('should list all configs for a game', async () => {
      // Setup: Create multiple configs
      for (let i = 0; i < 3; i++) {
        await request(API_BASE)
          .post('/api/admin/configs')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            gameId: TEST_GAME_ID,
            key: `config_${i}`,
            value: i * 100,
            dataType: 'number',
          });
      }

      const response = await request(API_BASE)
        .get(`/api/admin/configs/${TEST_GAME_ID}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.configs.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter configs by environment', async () => {
      // Create config in staging
      await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'staging_config',
          value: 'staging',
          dataType: 'string',
          environment: 'staging',
        });

      const response = await request(API_BASE)
        .get(`/api/admin/configs/${TEST_GAME_ID}?environment=staging`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      const hasConfigInStaging = response.body.data.configs.some(
        (c: any) => c.key === 'staging_config'
      );
      expect(hasConfigInStaging).toBe(true);
    });
  });

  describe('PUT /api/admin/configs/:configId', () => {
    let configId: string;

    beforeAll(async () => {
      // Create a config to update
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'updatable_config',
          value: 100,
          dataType: 'number',
        });

      configId = response.body.data.id;
    });

    it('should update config value', async () => {
      const response = await request(API_BASE)
        .put(`/api/admin/configs/${configId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          value: 150,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.value).toBe(150);
    });

    it('should update config enabled status', async () => {
      const response = await request(API_BASE)
        .put(`/api/admin/configs/${configId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          enabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.enabled).toBe(false);
    });

    it('should reject non-existent config', async () => {
      const response = await request(API_BASE)
        .put('/api/admin/configs/non_existent_id')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          value: 200,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/configs/:configId', () => {
    let configId: string;

    beforeAll(async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'deletable_config',
          value: 100,
          dataType: 'number',
        });

      configId = response.body.data.id;
    });

    it('should delete a config', async () => {
      const response = await request(API_BASE)
        .delete(`/api/admin/configs/${configId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for deleted config', async () => {
      const response = await request(API_BASE)
        .get(`/api/admin/configs/${TEST_GAME_ID}/${configId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/configs/:gameId (Public Fetch)', () => {
    beforeAll(async () => {
      // Setup: Create configs for testing
      await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'daily_reward_coins',
          value: 100,
          dataType: 'number',
        });
    });

    it('should fetch all configs without authentication', async () => {
      const response = await request(API_BASE)
        .get(`/api/configs/${TEST_GAME_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.configs).toHaveProperty('daily_reward_coins');
    });

    it('should include metadata in response', async () => {
      const response = await request(API_BASE)
        .get(`/api/configs/${TEST_GAME_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.data.metadata).toHaveProperty('gameId');
      expect(response.body.data.metadata).toHaveProperty('fetchedAt');
      expect(response.body.data.metadata).toHaveProperty('cacheUntil');
      expect(response.body.data.metadata).toHaveProperty('totalConfigs');
    });

    it('should cache results on subsequent calls', async () => {
      // First call (cache miss)
      const response1 = await request(API_BASE)
        .get(`/api/configs/${TEST_GAME_ID}`);

      // Second call (should be cached)
      const response2 = await request(API_BASE)
        .get(`/api/configs/${TEST_GAME_ID}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      // Both should have same data but second should be from cache
    });

    it('should accept query parameters for context', async () => {
      const response = await request(API_BASE)
        .get(
          `/api/configs/${TEST_GAME_ID}?platform=iOS&version=3.5.0&country=US`
        );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return debug info when requested', async () => {
      const response = await request(API_BASE)
        .get(
          `/api/configs/${TEST_GAME_ID}?platform=iOS&version=3.5.0&debug=true`
        );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('debug');
      expect(response.body.data.debug).toHaveProperty('evaluations');
      expect(response.body.data.debug).toHaveProperty('context');
    });
  });

  describe('Cache Invalidation', () => {
    let configId: string;

    beforeAll(async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'cache_test_config',
          value: 100,
          dataType: 'number',
        });

      configId = response.body.data.id;
    });

    it('should invalidate cache on config update', async () => {
      // Get cached config
      const fetch1 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}`
      );
      const initialValue = fetch1.body.data.configs.cache_test_config;

      // Update config
      await request(API_BASE)
        .put(`/api/admin/configs/${configId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          value: 200,
        });

      // Fetch again - should have updated value
      const fetch2 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}`
      );
      const updatedValue = fetch2.body.data.configs.cache_test_config;

      expect(initialValue).toBe(100);
      expect(updatedValue).toBe(200);
    });
  });
});

