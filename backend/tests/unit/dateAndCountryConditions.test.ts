/**
 * Unit Tests for Country and Date Condition Matching
 * Phase 7: User Story 5 - Country and Date-Based Rule Overwrites
 */

import { evaluateRules, ruleMatches } from '../../src/services/ruleEvaluator';
import { RuleOverwrite, RuleEvaluationContext } from '../../src/types/config.types';

describe('Country and Date Condition Matching (Phase 7)', () => {
  describe('Country Condition Matching (T115)', () => {
    it('should match exact country code', () => {
      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        countryCondition: 'DE',
      } as RuleOverwrite;

      const context: RuleEvaluationContext = {
        country: 'DE',
        serverTime: new Date(),
      };

      expect(ruleMatches(rule, context)).toBe(true);
    });

    it('should not match different country codes', () => {
      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        countryCondition: 'DE',
      } as RuleOverwrite;

      const context: RuleEvaluationContext = {
        country: 'US',
        serverTime: new Date(),
      };

      expect(ruleMatches(rule, context)).toBe(false);
    });

    it('should support multiple country codes', () => {
      const countries = ['US', 'DE', 'JP', 'GB', 'FR', 'CA', 'AU'];

      countries.forEach((country) => {
        const rule: RuleOverwrite = {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 200,
          enabled: true,
          countryCondition: country,
        } as RuleOverwrite;

        const context: RuleEvaluationContext = {
          country,
          serverTime: new Date(),
        };

        expect(ruleMatches(rule, context)).toBe(true);
      });
    });

    it('should ignore country condition if not specified', () => {
      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
      } as RuleOverwrite;

      const context: RuleEvaluationContext = {
        country: 'US',
        serverTime: new Date(),
      };

      expect(ruleMatches(rule, context)).toBe(true);
    });

    it('should treat missing context country as non-match', () => {
      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        countryCondition: 'DE',
      } as RuleOverwrite;

      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      expect(ruleMatches(rule, context)).toBe(false);
    });
  });

  describe('Date Condition Matching - activeAfter (T112, T116)', () => {
    it('should activate after specified date', () => {
      const activationDate = new Date('2026-02-01T00:00:00Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeAfter: activationDate,
      } as RuleOverwrite;

      // Before activation
      const beforeContext: RuleEvaluationContext = {
        serverTime: new Date('2026-01-31T23:59:59Z'),
      };
      expect(ruleMatches(rule, beforeContext)).toBe(false);

      // At activation
      const atContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-01T00:00:00Z'),
      };
      expect(ruleMatches(rule, atContext)).toBe(true);

      // After activation
      const afterContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-02T00:00:00Z'),
      };
      expect(ruleMatches(rule, afterContext)).toBe(true);
    });

    it('should use server time for date evaluation (T114)', () => {
      const activationDate = new Date('2026-02-01T00:00:00Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeAfter: activationDate,
      } as RuleOverwrite;

      // Context with explicit server time (not using Date.now())
      const context: RuleEvaluationContext = {
        serverTime: new Date('2026-02-15T12:00:00Z'),
      };

      expect(ruleMatches(rule, context)).toBe(true);
    });
  });

  describe('Date Condition Matching - activeBetween (T113, T116)', () => {
    it('should activate within date range', () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-14T23:59:59Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      // Before range
      const beforeContext: RuleEvaluationContext = {
        serverTime: new Date('2026-01-31T23:59:59Z'),
      };
      expect(ruleMatches(rule, beforeContext)).toBe(false);

      // Start of range
      const startContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-01T00:00:00Z'),
      };
      expect(ruleMatches(rule, startContext)).toBe(true);

      // Middle of range
      const middleContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(ruleMatches(rule, middleContext)).toBe(true);

      // End of range
      const endContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-14T23:59:59Z'),
      };
      expect(ruleMatches(rule, endContext)).toBe(true);

      // After range
      const afterContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-15T00:00:00Z'),
      };
      expect(ruleMatches(rule, afterContext)).toBe(false);
    });

    it('should treat end date as inclusive', () => {
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-14');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      const endContext: RuleEvaluationContext = {
        serverTime: new Date('2026-02-14T23:59:59Z'),
      };

      expect(ruleMatches(rule, endContext)).toBe(true);
    });

    it('should use UTC server time for date range evaluation', () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-14T23:59:59Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      // Test with explicit UTC time
      const context: RuleEvaluationContext = {
        serverTime: new Date('2026-02-07T15:30:45Z'),
      };

      expect(ruleMatches(rule, context)).toBe(true);
    });
  });

  describe('Multi-Condition Matching with Dates', () => {
    it('should require all conditions to match (country + date)', () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-14T23:59:59Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        countryCondition: 'DE',
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      // Country matches, but date doesn't
      const beforeContext: RuleEvaluationContext = {
        country: 'DE',
        serverTime: new Date('2026-01-31T23:59:59Z'),
      };
      expect(ruleMatches(rule, beforeContext)).toBe(false);

      // Date matches, but country doesn't
      const wrongCountryContext: RuleEvaluationContext = {
        country: 'US',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(ruleMatches(rule, wrongCountryContext)).toBe(false);

      // Both match
      const bothMatchContext: RuleEvaluationContext = {
        country: 'DE',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(ruleMatches(rule, bothMatchContext)).toBe(true);
    });

    it('should evaluate multi-condition rules with platform + country + date', () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-14T23:59:59Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        platformCondition: 'iOS',
        countryCondition: 'DE',
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      // All conditions match
      const matchContext: RuleEvaluationContext = {
        platform: 'iOS',
        country: 'DE',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(ruleMatches(rule, matchContext)).toBe(true);

      // One condition doesn't match
      const noMatchContext: RuleEvaluationContext = {
        platform: 'Android',
        country: 'DE',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(ruleMatches(rule, noMatchContext)).toBe(false);
    });
  });

  describe('Rule Evaluation Order with Date-Based Rules', () => {
    it('should evaluate date-based rules in priority order', () => {
      const now = new Date('2026-02-07T12:00:00Z');
      const promotionStart = new Date('2026-02-01T00:00:00Z');
      const promotionEnd = new Date('2026-02-14T23:59:59Z');

      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 300, // Promo: Germany + date range
          enabled: true,
          countryCondition: 'DE',
          activeBetweenStart: promotionStart,
          activeBetweenEnd: promotionEnd,
        } as RuleOverwrite,
        {
          id: 'rule_2',
          configId: 'config_1',
          priority: 2,
          overrideValue: 100, // Default
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        country: 'DE',
        serverTime: now,
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.overrideValue).toBe(300); // Gets promo value, not default
    });

    it('should fallback to lower priority if date condition not met', () => {
      const now = new Date('2026-02-15T12:00:00Z'); // After promo

      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 300, // Promo (expired)
          enabled: true,
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z'),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z'),
        } as RuleOverwrite,
        {
          id: 'rule_2',
          configId: 'config_1',
          priority: 2,
          overrideValue: 100, // Default
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        country: 'DE',
        serverTime: now,
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.overrideValue).toBe(100); // Gets default after promo expired
    });
  });

  describe('Valentine\'s Day Promotion Example', () => {
    it('should handle Valentine\'s Day promo (Feb 1-14)', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'valentines_de',
          configId: 'daily_reward',
          priority: 1,
          overrideValue: 200,
          enabled: true,
          countryCondition: 'DE',
          activeBetweenStart: new Date('2026-02-01T00:00:00Z'),
          activeBetweenEnd: new Date('2026-02-14T23:59:59Z'),
        } as RuleOverwrite,
        {
          id: 'default',
          configId: 'daily_reward',
          priority: 2,
          overrideValue: 100,
          enabled: true,
        } as RuleOverwrite,
      ];

      // During promo in Germany
      const duringPromoDE: RuleEvaluationContext = {
        country: 'DE',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(evaluateRules(rules, duringPromoDE)?.overrideValue).toBe(200);

      // During promo in other country
      const duringPromoUS: RuleEvaluationContext = {
        country: 'US',
        serverTime: new Date('2026-02-07T12:00:00Z'),
      };
      expect(evaluateRules(rules, duringPromoUS)?.overrideValue).toBe(100);

      // After promo in Germany
      const afterPromoDE: RuleEvaluationContext = {
        country: 'DE',
        serverTime: new Date('2026-02-15T12:00:00Z'),
      };
      expect(evaluateRules(rules, afterPromoDE)?.overrideValue).toBe(100);
    });
  });

  describe('Edge Cases for Date Conditions', () => {
    it('should handle exact boundary times', () => {
      const startDate = new Date('2026-02-01T12:00:00Z');
      const endDate = new Date('2026-02-14T18:00:00Z');

      const rule: RuleOverwrite = {
        id: 'rule_1',
        configId: 'config_1',
        priority: 1,
        overrideValue: 200,
        enabled: true,
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      } as RuleOverwrite;

      // Exact start time
      expect(
        ruleMatches(rule, {
          serverTime: new Date('2026-02-01T12:00:00Z'),
        })
      ).toBe(true);

      // Exact end time
      expect(
        ruleMatches(rule, {
          serverTime: new Date('2026-02-14T18:00:00Z'),
        })
      ).toBe(true);

      // One millisecond before start
      expect(
        ruleMatches(rule, {
          serverTime: new Date('2026-02-01T11:59:59.999Z'),
        })
      ).toBe(false);

      // One millisecond after end
      expect(
        ruleMatches(rule, {
          serverTime: new Date('2026-02-14T18:00:00.001Z'),
        })
      ).toBe(false);
    });
  });
});

