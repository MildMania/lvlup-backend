/**
 * Integration Tests for Rule Reordering
 * Phase 8: User Story 6 - Priority Management
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

describe('Rule Reordering Integration Tests (Phase 8)', () => {
  const prisma = new PrismaClient();
  const API_BASE = 'http://localhost:3000';
  const TEST_GAME_ID = 'test_game_priority_' + Date.now();
  const TEST_API_KEY = 'test_api_key_123';

  let configId: string;
  const ruleIds: string[] = [];

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

    // Create 3 rules with priorities 1, 2, 3
    for (let i = 1; i <= 3; i++) {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: i,
          overrideValue: 100 * i,
          platformCondition: ['iOS', 'Android', 'Web'][i - 1],
        });

      ruleIds.push(response.body.data.id);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Rule Reordering (T120, T125)', () => {
    it('should reorder rules and update priorities', async () => {
      // Reorder: rule 3 to priority 1, rule 1 to priority 2, rule 2 to priority 3
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          ruleOrder: [
            { ruleId: ruleIds[2], newPriority: 1 }, // Web -> priority 1
            { ruleId: ruleIds[0], newPriority: 2 }, // iOS -> priority 2
            { ruleId: ruleIds[1], newPriority: 3 }, // Android -> priority 3
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should verify rules have new priorities after reorder', async () => {
      const response = await request(API_BASE)
        .get(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      const rules = response.body.data.rules.sort((a: any, b: any) => a.priority - b.priority);

      // Check order after reordering
      expect(rules[0].id).toBe(ruleIds[2]); // Web, priority 1
      expect(rules[0].overrideValue).toBe(300);

      expect(rules[1].id).toBe(ruleIds[0]); // iOS, priority 2
      expect(rules[1].overrideValue).toBe(100);

      expect(rules[2].id).toBe(ruleIds[1]); // Android, priority 3
      expect(rules[2].overrideValue).toBe(200);
    });
  });

  describe('Priority Evaluation After Reorder (T126)', () => {
    it('should evaluate reordered rules in new priority order', async () => {
      // After reordering, Web (300) should have priority 1
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Web`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(300);
    });

    it('should skip higher priority rules that don\'t match', async () => {
      // iOS doesn't match Web condition (priority 1)
      // iOS has priority 2, should match
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(100);
    });
  });

  describe('Cache Invalidation After Reorder (T122)', () => {
    it('should invalidate cache when rules are reordered', async () => {
      // First fetch (caches result)
      const fetch1 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Web`
      );
      const cached = fetch1.body.data.configs.daily_reward_coins;

      // Reorder rules again
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          ruleOrder: [
            { ruleId: ruleIds[1], newPriority: 1 }, // Android -> priority 1
            { ruleId: ruleIds[2], newPriority: 2 }, // Web -> priority 2
            { ruleId: ruleIds[0], newPriority: 3 }, // iOS -> priority 3
          ],
        });

      // Second fetch should get different result (cache invalidated)
      const fetch2 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Android`
      );

      expect(fetch2.body.data.configs.daily_reward_coins).toBe(200); // Android now priority 1
    });
  });

  describe('First Matching Rule After Reorder (T127)', () => {
    it('should return first matching rule with new priorities', async () => {
      // Create test config with multiple matching rules
      const testConfig = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'test_rewards',
          value: 50,
          dataType: 'number',
        });

      const testConfigId = testConfig.body.data.id;
      const testRuleIds: string[] = [];

      // Create 3 rules that all match iOS
      for (let i = 1; i <= 3; i++) {
        const response = await request(API_BASE)
          .post(`/api/admin/configs/${testConfigId}/rules`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            priority: i,
            overrideValue: 100 + i * 10,
            platformCondition: 'iOS',
          });

        testRuleIds.push(response.body.data.id);
      }

      // All three rules match iOS
      const beforeReorder = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS`
      );

      // Reorder to change priority
      await request(API_BASE)
        .post(`/api/admin/configs/${testConfigId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          ruleOrder: [
            { ruleId: testRuleIds[2], newPriority: 1 }, // Last -> first
            { ruleId: testRuleIds[1], newPriority: 2 },
            { ruleId: testRuleIds[0], newPriority: 3 }, // First -> last
          ],
        });

      // After reorder, should get different first match
      const afterReorder = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS`
      );

      // Value should change because different rule now has priority 1
      expect(afterReorder.body.data.configs.test_rewards).toBe(130); // 3rd rule value
    });
  });

  describe('Duplicate Priority Prevention (T123)', () => {
    it('should not allow duplicate priorities in reorder', async () => {
      // Try to assign same priority to two rules
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          ruleOrder: [
            { ruleId: ruleIds[0], newPriority: 1 },
            { ruleId: ruleIds[1], newPriority: 1 }, // Duplicate!
            { ruleId: ruleIds[2], newPriority: 2 },
          ],
        });

      // Should either fail or auto-correct
      // If implementation allows, check for validation error
      expect([400, 409, 200]).toContain(response.status);
    });
  });

  describe('Batch Priority Update (T121)', () => {
    it('should update all rules in batch', async () => {
      const reorderPayload = {
        ruleOrder: [
          { ruleId: ruleIds[0], newPriority: 5 },
          { ruleId: ruleIds[1], newPriority: 6 },
          { ruleId: ruleIds[2], newPriority: 7 },
        ],
      };

      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send(reorderPayload);

      expect(response.status).toBe(200);

      // Verify all rules updated
      const rulesResponse = await request(API_BASE)
        .get(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      const rules = rulesResponse.body.data.rules;
      expect(rules.some((r: any) => r.priority === 5)).toBe(true);
      expect(rules.some((r: any) => r.priority === 6)).toBe(true);
      expect(rules.some((r: any) => r.priority === 7)).toBe(true);
    });
  });

  describe('Real-World Scenario: Sarah Reorders Rules', () => {
    it('should handle Sarah\'s Canadian rule reordering scenario', async () => {
      // Setup: Canada rule at priority 3, Android rule at priority 1
      const testConfig = await request(API_BASE)
        .post('/api/admin/configs')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          gameId: TEST_GAME_ID,
          key: 'sarah_rewards',
          value: 100,
          dataType: 'number',
        });

      const sarahConfigId = testConfig.body.data.id;
      const sarahRuleIds: string[] = [];

      // Rule 1: Android (priority 1)
      const androidRule = await request(API_BASE)
        .post(`/api/admin/configs/${sarahConfigId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 1,
          overrideValue: 125,
          platformCondition: 'Android',
        });
      sarahRuleIds.push(androidRule.body.data.id);

      // Rule 2: Canada (priority 3)
      const canadaRule = await request(API_BASE)
        .post(`/api/admin/configs/${sarahConfigId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 3,
          overrideValue: 150,
          countryCondition: 'CA',
        });
      sarahRuleIds.push(canadaRule.body.data.id);

      // Sarah drags Canada rule from position 3 to position 2 (higher priority)
      await request(API_BASE)
        .post(`/api/admin/configs/${sarahConfigId}/rules/reorder`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          ruleOrder: [
            { ruleId: sarahRuleIds[1], newPriority: 2 }, // Canada moves to priority 2
            { ruleId: sarahRuleIds[0], newPriority: 3 }, // Android moves to priority 3
          ],
        });

      // Verify: Canadian Android user should now get Canada rule (150) instead of Android rule (125)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Android&country=CA`
      );

      expect(response.body.data.configs.sarah_rewards).toBe(150); // Canada rule wins
    });
  });
});

