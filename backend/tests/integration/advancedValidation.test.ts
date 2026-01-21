/**
 * Integration Tests for Advanced Config Validation
 * Phase 4: User Story 2 - Config Creation with Validation
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

describe('Config Advanced Validation Integration Tests', () => {
  const prisma = new PrismaClient();
  const API_BASE = 'http://localhost:3000';
  const TEST_GAME_ID = 'test_game_validation_' + Date.now();
  const TEST_API_KEY = 'test_api_key_123';

  beforeAll(async () => {
    // Setup: Create test game if needed
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  describe('Duplicate Key Detection (T047, T059)', () => {
    const testKey = 'unique_key_' + Date.now();

    it('should allow first config with key', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: testKey,
          value: 100,
          dataType: 'number',
          environment: 'production',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe(testKey);
    });

    it('should reject duplicate key in same environment', async () => {
      // First create
      await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'duplicate_test',
          value: 100,
          dataType: 'number',
        });

      // Second create with same key
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'duplicate_test',
          value: 200,
          dataType: 'number',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should allow same key in different environments', async () => {
      const sharedKey = 'env_test_key';

      // Create in production
      const prodResponse = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: sharedKey,
          value: 100,
          dataType: 'number',
          environment: 'production',
        });

      expect(prodResponse.status).toBe(201);

      // Create in staging with same key
      const stagingResponse = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: sharedKey,
          value: 150,
          dataType: 'number',
          environment: 'staging',
        });

      expect(stagingResponse.status).toBe(201);
    });

    it('should allow same key in different games', async () => {
      const sharedKey = 'cross_game_key';

      // Create in game 1
      const game1Response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: 'game_1',
          key: sharedKey,
          value: 100,
          dataType: 'number',
        });

      expect(game1Response.status).toBe(201);

      // Create in game 2 with same key
      const game2Response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: 'game_2',
          key: sharedKey,
          value: 200,
          dataType: 'number',
        });

      expect(game2Response.status).toBe(201);
    });
  });

  describe('Key Format Validation (T046, T056)', () => {
    it('should accept valid key formats', async () => {
      const validKeys = [
        'daily_reward_coins',
        'max_health',
        'config_123',
        '_private_config',
        'CONFIG_NAME',
      ];

      for (const key of validKeys) {
        const response = await request(API_BASE)
          .post('/api/admin/configs')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            gameId: TEST_GAME_ID,
            key: key + '_' + Date.now(),
            value: 100,
            dataType: 'number',
          });

        expect(response.status).toBe(201);
      }
    });

    it('should reject keys with hyphens', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'invalid-key-name',
          value: 100,
          dataType: 'number',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('alphanumeric');
    });

    it('should reject keys over 64 characters', async () => {
      const longKey = 'a'.repeat(65);
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: longKey,
          value: 100,
          dataType: 'number',
        });

      expect(response.status).toBe(400);
    });

    it('should reject keys with special characters', async () => {
      const invalidKeys = ['config@key', 'config key', 'config.key', 'config#key'];

      for (const key of invalidKeys) {
        const response = await request(API_BASE)
          .post('/api/admin/configs')
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            gameId: TEST_GAME_ID,
            key,
            value: 100,
            dataType: 'number',
          });

        expect(response.status).toBe(400);
      }
    });
  });

  describe('Data Type Validation (T048, T057)', () => {
    it('should accept string values for string type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'string_config',
          value: 'hello world',
          dataType: 'string',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.dataType).toBe('string');
    });

    it('should reject non-string values for string type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'invalid_string',
          value: 123,
          dataType: 'string',
        });

      expect(response.status).toBe(400);
    });

    it('should accept number values for number type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'number_config',
          value: 42,
          dataType: 'number',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.dataType).toBe('number');
    });

    it('should accept boolean values for boolean type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'boolean_config',
          value: true,
          dataType: 'boolean',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.dataType).toBe('boolean');
    });

    it('should accept JSON objects for json type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'json_config',
          value: { key: 'value', nested: { data: 123 } },
          dataType: 'json',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.dataType).toBe('json');
    });
  });

  describe('JSON Structure Validation (T049, T058)', () => {
    it('should accept valid JSON objects', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'valid_json_object',
          value: { name: 'test', value: 100, enabled: true },
          dataType: 'json',
        });

      expect(response.status).toBe(201);
    });

    it('should accept valid JSON arrays', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'valid_json_array',
          value: [1, 2, 3, 'four', true],
          dataType: 'json',
        });

      expect(response.status).toBe(201);
    });

    it('should accept nested JSON structures', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'nested_json',
          value: {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ],
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
          dataType: 'json',
        });

      expect(response.status).toBe(201);
    });

    it('should reject non-JSON values for json type', async () => {
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'invalid_json',
          value: 'just a string',
          dataType: 'json',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Value Size Validation (T050)', () => {
    it('should accept values under 100KB', async () => {
      const mediumValue = 'x'.repeat(50000);
      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'medium_value',
          value: mediumValue,
          dataType: 'string',
        });

      expect(response.status).toBe(201);
    });

    it('should reject values over 100KB', async () => {
      const largeValue = 'x'.repeat(101 * 1024);
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

    it('should calculate size correctly for complex objects', async () => {
      const complexValue = {
        data: 'x'.repeat(50000),
        metadata: { created: new Date().toISOString() },
      };

      const response = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'complex_value',
          value: complexValue,
          dataType: 'json',
        });

      expect(response.status).toBe(201);
    });
  });
});

