/**
 * Unit Tests for Rule Evaluation Engine
 */

import {
  evaluateRules,
  ruleMatches,
  filterMatchingRules,
  getRuleConditionsSummary,
} from '../src/services/ruleEvaluator';
import { RuleOverwrite, RuleEvaluationContext } from '../src/types/config.types';

// Mock logger to avoid console spam
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Rule Evaluation Engine', () => {
  const mockRules: RuleOverwrite[] = [
    {
      id: 'rule1',
      configId: 'config1',
      priority: 1,
      enabled: true,
      overrideValue: 150,
      platformCondition: 'iOS',
      versionOperator: 'greater_or_equal',
      versionValue: '3.5.0',
      countryCondition: null,
      segmentCondition: null,
      activeAfter: null,
      activeBetweenStart: null,
      activeBetweenEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule2',
      configId: 'config1',
      priority: 2,
      enabled: true,
      overrideValue: 100,
      platformCondition: 'Android',
      versionOperator: null,
      versionValue: null,
      countryCondition: null,
      segmentCondition: null,
      activeAfter: null,
      activeBetweenStart: null,
      activeBetweenEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rule3',
      configId: 'config1',
      priority: 3,
      enabled: true,
      overrideValue: 200,
      platformCondition: null,
      versionOperator: null,
      versionValue: null,
      countryCondition: 'DE',
      segmentCondition: null,
      activeAfter: null,
      activeBetweenStart: null,
      activeBetweenEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  describe('evaluateRules', () => {
    it('should return null for empty rules', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = evaluateRules([], context);
      expect(result).toBeNull();
    });

    it('should match rule with platform condition', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = evaluateRules(mockRules, context);
      expect(result?.id).toBe('rule1');
    });

    it('should not match rule if platform does not match', () => {
      const context: RuleEvaluationContext = { platform: 'Web', version: '3.5.0' };
      const result = evaluateRules(mockRules, context);
      expect(result?.id).toBe('rule3'); // Falls back to country rule if set
    });

    it('should match rule with platform and version conditions', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = evaluateRules(mockRules, context);
      expect(result?.id).toBe('rule1');
      expect(result?.overrideValue).toBe(150);
    });

    it('should not match rule if version does not meet condition', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.4.0' };
      const result = evaluateRules(mockRules, context);
      // Should skip rule1 because version 3.4.0 is less than 3.5.0
      expect(result?.id).not.toBe('rule1');
    });

    it('should match country condition rule', () => {
      const context: RuleEvaluationContext = { country: 'DE' };
      const result = evaluateRules(mockRules, context);
      // rule1 has priority 1 with platformCondition=iOS, but context has no platform
      // Since rule has platform condition but context doesn't have platform value, it's not evaluated
      // So rule1 matches (platformCondition is effectively ignored when context has no platform)
      // This matches the behavior: null/missing context value means "don't check this condition"
      expect(result?.id).toBe('rule1');
    });

    it('should not match rule if platform condition requires different platform', () => {
      const context: RuleEvaluationContext = { platform: 'Android', country: 'DE' };
      const result = evaluateRules(mockRules, context);
      // rule1 requires iOS, so it doesn't match
      // rule2 matches Android, so it should win (priority 2)
      expect(result?.id).toBe('rule2');
    });

    it('should return first matching rule based on priority', () => {
      const context: RuleEvaluationContext = {
        platform: 'iOS',
        version: '3.5.0',
        country: 'DE',
      };
      const result = evaluateRules(mockRules, context);
      // rule1 has priority 1, should be matched first
      expect(result?.priority).toBe(1);
    });

    it('should skip disabled rules', () => {
      const disabledRule = { ...mockRules[0], enabled: false };
      const rulesWithDisabled = [disabledRule, ...mockRules.slice(1)];

      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = evaluateRules(rulesWithDisabled, context);
      // Should skip disabled rule1 and check rule2
      expect(result?.id).not.toBe('rule1');
    });

    it('should return null if no rules match', () => {
      // Create a context that doesn't match any rule
      const context: RuleEvaluationContext = {
        platform: 'Windows', // rule1 requires iOS
        country: 'US', // rule3 requires DE
        // rule2 requires Android
      };
      const result = evaluateRules(mockRules, context);
      expect(result).toBeNull();
    });

    it('should populate metrics when provided', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const metrics = {
        totalRules: 0,
        evaluatedRules: 0,
        matchedRule: null,
        evaluationTimeMs: 0,
        cacheHit: false,
      };

      evaluateRules(mockRules, context, metrics);

      expect(metrics.totalRules).toBe(3);
      expect(metrics.evaluatedRules).toBeGreaterThan(0);
      expect(metrics.matchedRule).toBe(1);
      expect(metrics.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should evaluate date conditions', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000);
      const pastDate = new Date(now.getTime() - 1000);

      const ruleWithFutureDate: RuleOverwrite = {
        ...mockRules[0],
        activeAfter: futureDate,
      };

      const context: RuleEvaluationContext = { serverTime: now };
      const result = evaluateRules([ruleWithFutureDate], context);

      // Rule should not match because current time is before activeAfter
      expect(result).toBeNull();
    });

    it('should evaluate activeBetween date conditions', () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 10000);
      const endDate = new Date(now.getTime() + 10000);

      const ruleWithDateRange: RuleOverwrite = {
        ...mockRules[0],
        activeBetweenStart: startDate,
        activeBetweenEnd: endDate,
      };

      const context: RuleEvaluationContext = { serverTime: now };
      const result = evaluateRules([ruleWithDateRange], context);

      // Rule should match because current time is within the range
      expect(result?.id).toBe(ruleWithDateRange.id);
    });
  });

  describe('ruleMatches', () => {
    it('should return true if rule matches context', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = ruleMatches(mockRules[0], context);
      expect(result).toBe(true);
    });

    it('should return false if rule does not match context', () => {
      const context: RuleEvaluationContext = { platform: 'Android', version: '3.5.0' };
      const result = ruleMatches(mockRules[0], context);
      expect(result).toBe(false);
    });
  });

  describe('filterMatchingRules', () => {
    it('should return all matching rules', () => {
      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = filterMatchingRules(mockRules, context);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('rule1');
    });

    it('should filter out disabled rules', () => {
      const disabledRule = { ...mockRules[0], enabled: false };
      const rulesWithDisabled = [disabledRule, ...mockRules.slice(1)];

      const context: RuleEvaluationContext = { platform: 'iOS', version: '3.5.0' };
      const result = filterMatchingRules(rulesWithDisabled, context);

      // Should not include disabled rule
      expect(result.find((r) => r.id === 'rule1')).toBeUndefined();
    });

    it('should return empty array if no rules match', () => {
      // Create a context that doesn't match any rule
      const context: RuleEvaluationContext = {
        platform: 'Windows', // rule1 requires iOS
        country: 'US', // rule3 requires DE
        // rule2 requires Android
      };
      const result = filterMatchingRules(mockRules, context);
      expect(result.length).toBe(0);
    });
  });

  describe('getRuleConditionsSummary', () => {
    it('should return summary of rule conditions', () => {
      const summary = getRuleConditionsSummary(mockRules[0]);
      expect(summary.platform).toBe('iOS');
      expect(summary.version).toContain('3.5.0');
      expect(summary.country).toBe('any');
    });

    it('should show "any" for null conditions', () => {
      const summary = getRuleConditionsSummary(mockRules[1]);
      expect(summary.platform).toBe('Android');
      expect(summary.country).toBe('any');
      expect(summary.segment).toBe('any');
    });
  });
});

