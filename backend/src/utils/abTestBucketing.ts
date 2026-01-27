/**
 * A/B Test Bucketing Utility
 * Deterministic user assignment to variants using consistent hashing
 * No database storage needed - purely computational
 */

import crypto from 'crypto';

/**
 * Assigns a user to a variant based on deterministic hashing
 * Same userId + experimentId always returns same variant
 * 
 * @param userId - Unique user identifier (must be consistent across sessions)
 * @param experimentId - Unique experiment identifier (e.g., rule.id or config.key)
 * @param trafficPercentage - Percentage of users to include (0-100), default 100
 * @param salt - Optional salt to reset bucketing (e.g., "2026-01-27" for date-based reset)
 * @returns true if user is in the experiment bucket, false otherwise
 */
export function shouldIncludeUser(
  userId: string,
  experimentId: string,
  trafficPercentage: number = 100,
  salt: string = ''
): boolean {
  // If 100% traffic, always include
  if (trafficPercentage >= 100) {
    return true;
  }

  // If 0% traffic, never include
  if (trafficPercentage <= 0) {
    return false;
  }

  // Create a deterministic hash from userId + experimentId + salt
  const hashInput = `${userId}:${experimentId}:${salt}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  
  // Convert first 8 characters of hash to a number between 0-99
  const bucket = parseInt(hash.substring(0, 8), 16) % 100;
  
  // User is included if their bucket is less than traffic percentage
  return bucket < trafficPercentage;
}

/**
 * Assigns a user to a specific variant in a multi-variant test
 * 
 * @param userId - Unique user identifier
 * @param experimentId - Unique experiment identifier
 * @param variants - Array of variant objects with name and percentage
 * @param salt - Optional salt to reset bucketing
 * @returns The assigned variant name, or null if user is in control group
 * 
 * @example
 * const variant = assignToVariant('user123', 'daily_reward_test', [
 *   { name: 'variant_a', percentage: 25 },
 *   { name: 'variant_b', percentage: 25 },
 *   { name: 'variant_c', percentage: 25 },
 *   // Remaining 25% go to control (null)
 * ]);
 */
export function assignToVariant(
  userId: string,
  experimentId: string,
  variants: Array<{ name: string; percentage: number }>,
  salt: string = ''
): string | null {
  // Calculate total traffic percentage
  const totalPercentage = variants.reduce((sum, v) => sum + v.percentage, 0);
  
  if (totalPercentage > 100) {
    throw new Error('Total variant percentages cannot exceed 100%');
  }

  // Create deterministic hash
  const hashInput = `${userId}:${experimentId}:${salt}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const bucket = parseInt(hash.substring(0, 8), 16) % 100;

  // Assign to variant based on cumulative percentages
  let cumulativePercentage = 0;
  for (const variant of variants) {
    cumulativePercentage += variant.percentage;
    if (bucket < cumulativePercentage) {
      return variant.name;
    }
  }

  // User is in control group (remaining percentage)
  return null;
}

/**
 * Example usage in Remote Config context:
 * 
 * Rule with A/B test:
 * {
 *   "id": "rule_123",
 *   "priority": 1,
 *   "overrideValue": 200,
 *   "trafficPercentage": 50,  // Only 50% of users see this
 *   "variantName": "variant_a"
 * }
 * 
 * Backend evaluation:
 * const isIncluded = shouldIncludeUser(userId, rule.id, rule.trafficPercentage);
 * if (isIncluded && evaluateRuleConditions(rule, context)) {
 *   return rule.overrideValue;  // User sees 200
 * }
 * // Otherwise user sees default value (100)
 */

/**
 * Generate a salt for resetting experiment bucketing
 * Use this when you want to re-randomize user assignments
 * 
 * @example
 * const salt = generateExperimentSalt('2026-01-27'); // Date-based reset
 * const salt = generateExperimentSalt('v2'); // Version-based reset
 */
export function generateExperimentSalt(identifier: string): string {
  return `salt_${identifier}`;
}

