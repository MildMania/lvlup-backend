/**
 * Integration Tests for Date-Based Rule Activation
 * Phase 7: User Story 5 - Country and Date-Based Rule Overwrites
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

describe('Date-Based Rule Activation Integration Tests (Phase 7)', () => {
  const prisma = new PrismaClient();
  const API_BASE = 'http://localhost:3000';
  const TEST_GAME_ID = 'test_game_dates_' + Date.now();
  const TEST_API_KEY = 'test_api_key_123';

  let configId: string;

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

  describe('Country Condition Validation (T107)', () => {
    it('should accept valid ISO country codes', async () => {
      const validCodes = ['US', 'DE', 'JP', 'GB', 'FR', 'CA'];

      for (const code of validCodes) {
        const response = await request(API_BASE)
          .post(`/api/admin/configs/${configId}/rules`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            priority: 50 + validCodes.indexOf(code),
            overrideValue: 150,
            countryCondition: code,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.countryCondition).toBe(code);
      }
    });

    it('should reject invalid country codes', async () => {
      const invalidCodes = ['USA', 'DEB', 'German', 'japan'];

      for (const code of invalidCodes) {
        const response = await request(API_BASE)
          .post(`/api/admin/configs/${configId}/rules`)
          .set('Authorization', `Bearer ${TEST_API_KEY}`)
          .send({
            priority: 100,
            overrideValue: 150,
            countryCondition: code,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('ISO 3166-1');
      }
    });
  });

  describe('Date Condition Validation (T108-T109)', () => {
    it('should accept valid ISO 8601 dates', async () => {
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 200,
          overrideValue: 150,
          activeAfter: new Date('2026-02-01T00:00:00Z').toISOString(),
        });

      expect(response.status).toBe(201);
    });

    it('should validate activeBetween end date is after start date (T109)', async () => {
      const startDate = new Date('2026-02-14T00:00:00Z');
      const endDate = new Date('2026-02-01T00:00:00Z'); // Before start

      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 201,
          overrideValue: 150,
          activeBetweenStart: startDate.toISOString(),
          activeBetweenEnd: endDate.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('after');
    });

    it('should accept activeBetween with valid date range', async () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-14T23:59:59Z');

      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 202,
          overrideValue: 150,
          activeBetweenStart: startDate.toISOString(),
          activeBetweenEnd: endDate.toISOString(),
        });

      expect(response.status).toBe(201);
    });
  });

  describe('Date-Based Rule Activation (T117)', () => {
    let valentinesRuleId: string;

    beforeAll(async () => {
      // Create Valentine's Day promotion rule
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 1,
          overrideValue: 300,
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z').toISOString(),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z').toISOString(),
        });

      valentinesRuleId = response.body.data.id;
    });

    it('should activate rule at exact start time (T118)', async () => {
      // Test at exact start time: Feb 1, 00:00:00
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-02-01T00:00:00Z`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(300);
    });

    it('should be active during promotion period', async () => {
      // Test during period: Feb 7, 12:00:00
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-02-07T12:00:00Z`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(300);
    });

    it('should deactivate at end of promotion period (T118)', async () => {
      // Test one second after end: Feb 15, 00:00:00
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-02-15T00:00:00Z`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(100); // Default
    });

    it('should not activate before promotion start', async () => {
      // Test before start: Jan 31, 23:59:59
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-01-31T23:59:59Z`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(100); // Default
    });

    it('should still activate at exact end time', async () => {
      // Test at exact end: Feb 14, 23:59:59
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-02-14T23:59:59Z`
      );

      expect(response.status).toBe(200);
      expect(response.body.data.configs.daily_reward_coins).toBe(300);
    });
  });

  describe('Country-Specific Promotion Rules', () => {
    it('should apply country-specific rule only to matching country', async () => {
      // Germany during promotion
      const germanResponse = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=DE&debugTime=2026-02-07T12:00:00Z`
      );
      expect(germanResponse.body.data.configs.daily_reward_coins).toBe(300);

      // US during same period
      const usResponse = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?country=US&debugTime=2026-02-07T12:00:00Z`
      );
      expect(usResponse.body.data.configs.daily_reward_coins).toBe(100);
    });
  });

  describe('Multi-Condition Date Rules', () => {
    let multiRuleId: string;

    beforeAll(async () => {
      // Create rule: iOS users in Germany during promotion
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 10,
          overrideValue: 400,
          platformCondition: 'iOS',
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z').toISOString(),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z').toISOString(),
        });

      multiRuleId = response.body.data.id;
    });

    it('should require all conditions to match for multi-condition rules', async () => {
      // iOS + Germany + during promotion
      const response1 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&country=DE&debugTime=2026-02-07T12:00:00Z`
      );
      expect(response1.body.data.configs.daily_reward_coins).toBe(400);

      // iOS + US (no match)
      const response2 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&country=US&debugTime=2026-02-07T12:00:00Z`
      );
      expect(response2.body.data.configs.daily_reward_coins).not.toBe(400);

      // Android + Germany (no match)
      const response3 = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=Android&country=DE&debugTime=2026-02-07T12:00:00Z`
      );
      expect(response3.body.data.configs.daily_reward_coins).not.toBe(400);
    });
  });

  describe('Server UTC Time Usage (T114)', () => {
    it('should evaluate dates using UTC server time', async () => {
      // Create rule with specific UTC times
      const response = await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 11,
          overrideValue: 250,
          activeAfter: new Date('2026-02-10T15:30:00Z').toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.data.activeAfter).toContain('2026-02-10T15:30:00');
    });
  });

  describe('Multiple Date-Based Rules with Priority', () => {
    it('should evaluate date rules in priority order', async () => {
      // Rule 1 (higher priority): General Germany promo
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 20,
          overrideValue: 200,
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z').toISOString(),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z').toISOString(),
        });

      // Rule 2 (lower priority): Special iOS promo in DE
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 21,
          overrideValue: 300,
          platformCondition: 'iOS',
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z').toISOString(),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z').toISOString(),
        });

      // iOS user in DE should get 200 (higher priority rule)
      const response = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?platform=iOS&country=DE&debugTime=2026-02-07T12:00:00Z`
      );

      expect(response.body.data.configs.daily_reward_coins).toBe(200);
    });
  });

  describe('ActiveAfter Rules', () => {
    it('should activate after specified date and stay active', async () => {
      // Create rule that activates on Feb 10
      await request(API_BASE)
        .post(`/api/admin/configs/${configId}/rules`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          priority: 30,
          overrideValue: 350,
          activeAfter: new Date('2026-02-10T00:00:00Z').toISOString(),
        });

      // Before Feb 10
      const beforeResponse = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?debugTime=2026-02-09T23:59:59Z`
      );
      expect(beforeResponse.body.data.configs.daily_reward_coins).not.toBe(350);

      // On Feb 10
      const onResponse = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?debugTime=2026-02-10T00:00:00Z`
      );
      expect(onResponse.body.data.configs.daily_reward_coins).toBe(350);

      // After Feb 14 (should still be active)
      const afterResponse = await request(API_BASE).get(
        `/api/configs/${TEST_GAME_ID}?debugTime=2026-02-20T00:00:00Z`
      );
      expect(afterResponse.body.data.configs.daily_reward_coins).toBe(350);
    });
  });
});

