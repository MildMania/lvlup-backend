/**
 * Rule Evaluation Engine
 * Implements server-side rule evaluation for remote configs
 * Evaluates platform, version, country, date, and segment conditions
 */

import { compareVersions } from '../utils/semver';
import {
  RuleOverwrite,
  RuleEvaluationContext,
  ConfigEvaluationResult,
  RuleEvaluationMetrics,
} from '../types/config.types';
import logger from '../utils/logger';

/**
 * Evaluates a single rule condition against the evaluation context
 * @param rule The rule to evaluate
 * @param context The evaluation context
 * @returns true if all conditions match, false otherwise
 */
function evaluateRuleCondition(rule: RuleOverwrite, context: RuleEvaluationContext): boolean {
  // Platform condition
  if (rule.platformCondition && context.platform) {
    if (rule.platformCondition !== context.platform) {
      return false;
    }
  }

  // Version condition
  if (rule.versionOperator && rule.versionValue && context.version) {
    try {
      if (!compareVersions(context.version, rule.versionOperator, rule.versionValue)) {
        return false;
      }
    } catch (error) {
      logger.error('Version comparison error:', {
        contextVersion: context.version,
        operator: rule.versionOperator,
        constraintVersion: rule.versionValue,
        error,
      });
      return false;
    }
  }

  // Country condition
  if (rule.countryCondition && context.country) {
    if (rule.countryCondition !== context.country) {
      return false;
    }
  }

  // Segment condition
  if (rule.segmentCondition && context.segment) {
    if (rule.segmentCondition !== context.segment) {
      return false;
    }
  }

  // Date conditions
  const now = context.serverTime || new Date();

  // activeAfter condition
  if (rule.activeAfter) {
    if (now < rule.activeAfter) {
      return false;
    }
  }

  // activeBetween condition
  if (rule.activeBetweenStart && rule.activeBetweenEnd) {
    if (now < rule.activeBetweenStart || now > rule.activeBetweenEnd) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates rules in priority order and returns the first matching value
 * Rules are sorted by priority in ascending order (1, 2, 3...)
 * @param rules Array of rules (should be sorted by priority)
 * @param context Evaluation context
 * @param metrics Optional metrics object to populate
 * @returns Matched rule or null if no match
 */
export function evaluateRules(
  rules: RuleOverwrite[],
  context: RuleEvaluationContext,
  metrics?: RuleEvaluationMetrics
): RuleOverwrite | null {
  if (!rules || rules.length === 0) {
    if (metrics) {
      metrics.totalRules = 0;
      metrics.evaluatedRules = 0;
      metrics.matchedRule = null;
    }
    return null;
  }

  // Sort rules by priority (ascending order - lower number = higher priority)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  let evaluatedCount = 0;
  const startTime = Date.now();

  // Evaluate each rule in priority order
  for (const rule of sortedRules) {
    // Skip disabled rules
    if (!rule.enabled) {
      continue;
    }

    evaluatedCount++;

    if (evaluateRuleCondition(rule, context)) {
      const evaluationTime = Date.now() - startTime;

      if (metrics) {
        metrics.totalRules = rules.length;
        metrics.evaluatedRules = evaluatedCount;
        metrics.matchedRule = rule.priority;
        metrics.evaluationTimeMs = evaluationTime;
        metrics.cacheHit = false;

        // Warn if evaluation is slow
        if (evaluationTime > 50) {
          logger.warn('Slow rule evaluation:', {
            evaluationTimeMs: evaluationTime,
            totalRules: rules.length,
            evaluatedRules: evaluatedCount,
            matchedPriority: rule.priority,
          });
        }
      }

      logger.debug('Rule matched:', {
        ruleId: rule.id,
        priority: rule.priority,
        evaluationTimeMs: metrics?.evaluationTimeMs,
      });

      return rule;
    }
  }

  const evaluationTime = Date.now() - startTime;

  if (metrics) {
    metrics.totalRules = rules.length;
    metrics.evaluatedRules = evaluatedCount;
    metrics.matchedRule = null;
    metrics.evaluationTimeMs = evaluationTime;
    metrics.cacheHit = false;
  }

  logger.debug('No rule matched', {
    totalRules: rules.length,
    evaluatedRules: evaluatedCount,
    evaluationTimeMs: evaluationTime,
  });

  return null;
}

/**
 * Determines if a rule matches the evaluation context
 * Useful for testing individual rule conditions
 * @param rule The rule to test
 * @param context The evaluation context
 * @returns true if rule matches, false otherwise
 */
export function ruleMatches(rule: RuleOverwrite, context: RuleEvaluationContext): boolean {
  return evaluateRuleCondition(rule, context);
}

/**
 * Filters rules by conditions (used for validation)
 * @param rules Array of rules
 * @param context Evaluation context
 * @returns Array of matching rules
 */
export function filterMatchingRules(
  rules: RuleOverwrite[],
  context: RuleEvaluationContext
): RuleOverwrite[] {
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    return evaluateRuleCondition(rule, context);
  });
}

/**
 * Gets all conditions from a rule as a readable object
 * @param rule The rule
 * @returns Object describing all conditions
 */
export function getRuleConditionsSummary(rule: RuleOverwrite): Record<string, unknown> {
  return {
    platform: rule.platformCondition || 'any',
    version: rule.versionValue ? `${rule.versionOperator} ${rule.versionValue}` : 'any',
    country: rule.countryCondition || 'any',
    segment: rule.segmentCondition || 'any',
    activeAfter: rule.activeAfter?.toISOString() || 'never',
    activeBetween: rule.activeBetweenStart
      ? `${rule.activeBetweenStart.toISOString()} - ${rule.activeBetweenEnd?.toISOString()}`
      : 'never',
  };
}

