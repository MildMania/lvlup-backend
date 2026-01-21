/**
 * Integration Tests for Rule Evaluation
 * Phase 6: User Story 4 - Platform-Specific Rule Overwrites
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

describe('Rule Overwrite Integration Tests', () => {
  const prisma = new PrismaClient();
  const API_BASE = 'http://localhost:3000';
  const TEST_GAME_ID = 'test_game_rules_' + Date.now();
  const TEST_API_KEY = 'test_api_key_123';

  let configId: string;
  let ruleId: string;

  beforeAll(async () => {
    // Create a test config
    const configResponse = await request(API_BASE)
      .post('/api/admin/configs')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        gameId: TEST_GAME_ID,
        key: 'daily_reward_coins',
        value: 100,
        dataType: 'number',
        environment: 'production',
      });

    configId = configResponse.body.data.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Create Rule (T092)', () => {
    it('should create a rule with platform condition', async () => {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 1,
          overrideValue: 150,
          platformCondition: 'iOS',
          enabled: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe(1);
      expect(response.body.data.platformCondition).toBe('iOS');
      expect(response.body.data.overrideValue).toBe(150);

      ruleId = response.body.data.id;
    });

    it('should create rule with version condition', async () => {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 2,
          overrideValue: 125,
          platformCondition: 'Android',
          versionOperator: 'greater_or_equal',
          versionValue: '2.0.0',
          enabled: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.versionOperator).toBe('greater_or_equal');
      expect(response.body.data.versionValue).toBe('2.0.0');
    });

    it('should reject duplicate priority', async () => {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 1, // Already used
          overrideValue: 200,
          enabled: true,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('should validate override value type', async () => {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 3,
          overrideValue: 'not_a_number', // Config is number type
          enabled: true,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('List Rules', () => {
    it('should list all rules for a config', async () => {
      const response = await request(API_BASE)
        .get(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.rules)).toBe(true);
      expect(response.body.data.rules.length).toBeGreaterThan(0);
    });

    it('should return rules sorted by priority', async () => {
      const response = await request(API_BASE)
        .get(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      const rules = response.body.data.rules;
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i].priority).toBeGreaterThanOrEqual(rules[i - 1].priority);
      }
    });
  });

  describe('Update Rule (T093)', () => {
    it('should update rule override value', async () => {
      const response = await request(API_BASE)
        .put(`/api/admin/configs/${configId}/rules/${ruleId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          overrideValue: 175,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.overrideValue).toBe(175);
    });

    it('should update rule enabled status', async () => {
      const response = await request(API_BASE)
        .put(`/api/admin/configs/${configId}/rules/${ruleId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          enabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.enabled).toBe(false);
    });

    it('should reject invalid rule ID', async () => {
      const response = await request(API_BASE)
        .put(`/api/admin/configs/${configId}/rules/invalid_id`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          overrideValue: 200,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('Delete Rule (T094)', () => {
    let deleteRuleId: string;

    beforeAll(async () => {
      const createResponse = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 5,
          overrideValue: 300,
          enabled: true,
        });

      deleteRuleId = createResponse.body.data.id;
    });

    it('should delete a rule', async () => {
      const response = await request(API_BASE)
        .delete(`/api/admin/configs/${configId}/rules/${deleteRuleId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for deleted rule', async () => {
      const response = await request(API_BASE)
        .delete(`/api/admin/configs/${configId}/rules/${deleteRuleId}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Rule Evaluation (T105)', () => {
    it('should evaluate iOS v3.5.0 receives 150', async () => {
      // Create rule: iOS >= 3.5.0 gets 150
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 10,
          overrideValue: 150,
          platformCondition: 'iOS',
          versionOperator: 'greater_or_equal',
          versionValue: '3.5.0',
        });

      // Fetch with iOS 3.5.0 context
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&version=3.5.0`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(150);
    });

    it('should evaluate iOS v3.4.0 receives 100 (T106)', async () => {
      // Fetch with iOS 3.4.0 context (below 3.5.0, should get default)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&version=3.4.0`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(100);
    });

    it('should evaluate Android receives 100 (default)', async () => {
      // Fetch with Android context (no matching rule, should get default)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Android`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(100);
    });
  });

  describe('Rule Priority Ordering', () => {
    it('should return first matching rule', async () => {
      // Create two rules with same conditions but different priorities
      const rule1 = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 20,
          overrideValue: 200,
          platformCondition: 'Web',
        });

      const rule2 = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 21,
          overrideValue: 250,
          platformCondition: 'Web',
        });

      // Fetch should return priority 20 (higher priority)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Web`
      );

      expect(response.body.data.configs.daily_reward_coins).toBe(200);
    });
  });

  describe('Version Operator Validation', () => {
    it('should support all version operators', async () => {
      const operators = [
        'equal',
        'not_equal',
        'greater_than',
        'greater_or_equal',
        'less_than',
        'less_or_equal',
      ];

      for (const op of operators) {
        const response = await request(API_BASE)
          .post(`/api/admin/configs/${configId}/rules`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            priority: 30 + operators.indexOf(op),
            overrideValue: 150,
            platformCondition: 'iOS',
            versionOperator: op,
            versionValue: '1.0.0',
          });

        expect(response.status).toBe(201);
      }
    });
  });

  describe('Multi-Condition Rules', () => {
    it('should match when all conditions match', async () => {
      // Create rule: iOS AND version >= 3.0.0
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 40,
          overrideValue: 180,
          platformCondition: 'iOS',
          versionOperator: 'greater_or_equal',
          versionValue: '3.0.0',
        });

      // iOS 3.5.0 should match
      const response1 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&version=3.5.0`
      );
      expect(response1.body.data.configs.daily_reward_coins).toBe(180);
    });

    it('should not match when only some conditions match', async () => {
      // Android 3.5.0 should not match (platform doesn't match)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Android&version=3.5.0`
      );
      expect(response.body.data.configs.daily_reward_coins).toBe(100);
    });
  });
});

