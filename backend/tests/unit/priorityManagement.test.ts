/**
 * Unit Tests for Priority-Based Rule Evaluation
 * Phase 8: User Story 6 - Priority Management
 */

import { evaluateRules } from '../../src/services/ruleEvaluator';
import { RuleOverwrite, RuleEvaluationContext } from '../../src/types/config.types';

describe('Priority-Based Rule Evaluation (Phase 8)', () => {
  describe('Priority Ordering (T126)', () => {
    it('should evaluate rules in ascending priority order', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_3',
          configId: 'config_1',
          priority: 3,
          overrideValue: 300,
          enabled: true,
        } as RuleOverwrite,
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: true,
        } as RuleOverwrite,
        {
          id: 'rule_2',
          configId: 'config_1',
          priority: 2,
          overrideValue: 200,
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.priority).toBe(1); // Should match priority 1 first
      expect(matched?.overrideValue).toBe(100);
    });

    it('should respect priority over position in array', () => {
      const rules: RuleOverwrite[] = [
        // Lowest priority first in array
        {
          id: 'rule_low',
          configId: 'config_1',
          priority: 3,
          overrideValue: 300,
          enabled: true,
        } as RuleOverwrite,
        // Higher priority later in array
        {
          id: 'rule_high',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.id).toBe('rule_high'); // Should still pick priority 1
      expect(matched?.priority).toBe(1);
    });
  });

  describe('First Match Wins (T127)', () => {
    it('should return first matching rule and not evaluate others', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
        {
          id: 'rule_2',
          configId: 'config_1',
          priority: 2,
          overrideValue: 200,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        platform: 'iOS',
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.id).toBe('rule_1'); // First matching wins
      expect(matched?.overrideValue).toBe(100);
    });

    it('should stop evaluation after first match', () => {
      // All rules would match the condition
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
        {
          id: 'rule_2',
          configId: 'config_1',
          priority: 2,
          overrideValue: 200,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
        {
          id: 'rule_3',
          configId: 'config_1',
          priority: 3,
          overrideValue: 300,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        platform: 'iOS',
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.priority).toBe(1);
      expect(matched?.overrideValue).toBe(100); // Not 200 or 300
    });
  });

  describe('Priority Gaps', () => {
    it('should handle non-sequential priorities', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_10',
          configId: 'config_1',
          priority: 10,
          overrideValue: 100,
          enabled: true,
        } as RuleOverwrite,
        {
          id: 'rule_100',
          configId: 'config_1',
          priority: 100,
          overrideValue: 200,
          enabled: true,
        } as RuleOverwrite,
        {
          id: 'rule_5',
          configId: 'config_1',
          priority: 5,
          overrideValue: 50,
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.priority).toBe(5); // Should match lowest priority
      expect(matched?.overrideValue).toBe(50);
    });
  });

  describe('Disabled Rules Skipping', () => {
    it('should skip disabled rules even if higher priority', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1_disabled',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: false, // Disabled
        } as RuleOverwrite,
        {
          id: 'rule_2_enabled',
          configId: 'config_1',
          priority: 2,
          overrideValue: 200,
          enabled: true,
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched?.id).toBe('rule_2_enabled'); // Should skip disabled
      expect(matched?.priority).toBe(2);
    });
  });

  describe('No Match Scenario', () => {
    it('should return null if no rules match', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'rule_1',
          configId: 'config_1',
          priority: 1,
          overrideValue: 100,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
      ];

      const context: RuleEvaluationContext = {
        platform: 'Android',
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, context);
      expect(matched).toBeNull();
    });

    it('should return null for empty rule list', () => {
      const context: RuleEvaluationContext = {
        serverTime: new Date(),
      };

      const matched = evaluateRules([], context);
      expect(matched).toBeNull();
    });
  });

  describe('Real-World Scenario: Sarah\'s Promotional Rules', () => {
    it('should handle multiple geographic rules with correct priority', () => {
      // Sarah\'s rules for daily_reward_coins
      const rules: RuleOverwrite[] = [
        {
          id: 'canada_rule',
          configId: 'daily_reward',
          priority: 1, // Highest priority
          overrideValue: 150,
          enabled: true,
          countryCondition: 'CA',
        } as RuleOverwrite,
        {
          id: 'android_rule',
          configId: 'daily_reward',
          priority: 2,
          overrideValue: 125,
          enabled: true,
          platformCondition: 'Android',
        } as RuleOverwrite,
        {
          id: 'ios_rule',
          configId: 'daily_reward',
          priority: 3,
          overrideValue: 100,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
      ];

      // Canadian user
      const canadianContext: RuleEvaluationContext = {
        country: 'CA',
        platform: 'Android',
        serverTime: new Date(),
      };
      expect(evaluateRules(rules, canadianContext)?.overrideValue).toBe(150);

      // US Android user
      const usAndroidContext: RuleEvaluationContext = {
        country: 'US',
        platform: 'Android',
        serverTime: new Date(),
      };
      expect(evaluateRules(rules, usAndroidContext)?.overrideValue).toBe(125);

      // US iOS user
      const usIosContext: RuleEvaluationContext = {
        country: 'US',
        platform: 'iOS',
        serverTime: new Date(),
      };
      expect(evaluateRules(rules, usIosContext)?.overrideValue).toBe(100);
    });
  });

  describe('Priority with Multiple Conditions', () => {
    it('should evaluate in priority order even with different conditions', () => {
      const rules: RuleOverwrite[] = [
        {
          id: 'specific',
          configId: 'config_1',
          priority: 1,
          overrideValue: 300,
          enabled: true,
          platformCondition: 'iOS',
          countryCondition: 'US',
        } as RuleOverwrite,
        {
          id: 'general',
          configId: 'config_1',
          priority: 2,
          overrideValue: 200,
          enabled: true,
          platformCondition: 'iOS',
        } as RuleOverwrite,
      ];

      const iPhoneUSContext: RuleEvaluationContext = {
        platform: 'iOS',
        country: 'US',
        serverTime: new Date(),
      };

      const matched = evaluateRules(rules, iPhoneUSContext);
      expect(matched?.priority).toBe(1);
      expect(matched?.overrideValue).toBe(300);
    });
  });
});

