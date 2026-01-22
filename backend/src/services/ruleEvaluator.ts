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
  // Platform condition with version range - check if context platform matches and version is in range
  if (rule.platformConditions && Array.isArray(rule.platformConditions) && rule.platformConditions.length > 0) {
    if (!context.platform) {
      // If context has no platform but rule requires platforms, rule doesn't match
      return false;
    }
    
    // Find matching platform condition
    const platformMatch = (rule.platformConditions as any[]).find(
      (pc: any) => pc.platform === context.platform
    );
    
    if (!platformMatch) {
      // Platform not in the rule's platform list
      return false;
    }
    
    // Check version range if specified
    if (context.version) {
      try {
        if (platformMatch.minVersion && compareVersions(context.version, 'less_than', platformMatch.minVersion)) {
          return false; // Context version is below minimum
        }
        if (platformMatch.maxVersion && compareVersions(context.version, 'greater_than', platformMatch.maxVersion)) {
          return false; // Context version is above maximum
        }
      } catch (error) {
        logger.error('Version range comparison error:', {
          contextVersion: context.version,
          platform: platformMatch.platform,
          minVersion: platformMatch.minVersion,
          maxVersion: platformMatch.maxVersion,
          error,
        });
        return false;
      }
    }
  }

  // Country condition - check if context country is in the allowed countries array
  if (rule.countryConditions && Array.isArray(rule.countryConditions) && rule.countryConditions.length > 0 && context.country) {
    if (!rule.countryConditions.includes(context.country)) {
      return false;
    }
  }

  // Segment condition - check if context segment is in the allowed segments array
  if (rule.segmentConditions && Array.isArray(rule.segmentConditions) && rule.segmentConditions.length > 0 && context.segment) {
    if (!rule.segmentConditions.includes(context.segment)) {
      return false;
    }
  }

  // Date range condition - check if current time is within activation period
  const now = context.serverTime || new Date();

  if (rule.activeBetweenStart && rule.activeBetweenEnd) {
    if (now < rule.activeBetweenStart || now > rule.activeBetweenEnd) {
      return false; // Current time is outside the activation window
    }
  } else if (rule.activeBetweenStart) {
    // Only start date specified - active from start onwards
    if (now < rule.activeBetweenStart) {
      return false;
    }
  } else if (rule.activeBetweenEnd) {
    // Only end date specified - active until end
    if (now > rule.activeBetweenEnd) {
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
  const platformSummary = rule.platformConditions && Array.isArray(rule.platformConditions)
    ? (rule.platformConditions as any[])
        .map((pc: any) => {
          const versionRange = pc.minVersion || pc.maxVersion
            ? `(${pc.minVersion || '*'}-${pc.maxVersion || '*'})`
            : '';
          return `${pc.platform}${versionRange}`;
        })
        .join(', ')
    : 'any';

  return {
    platforms: platformSummary,
    countries: rule.countryConditions && rule.countryConditions.length > 0 ? rule.countryConditions.join(', ') : 'any',
    segments: rule.segmentConditions && rule.segmentConditions.length > 0 ? rule.segmentConditions.join(', ') : 'any',
    activeBetween: rule.activeBetweenStart || rule.activeBetweenEnd
      ? `${rule.activeBetweenStart?.toISOString() || 'start'} - ${rule.activeBetweenEnd?.toISOString() || 'end'}`
      : 'always',
  };
}

