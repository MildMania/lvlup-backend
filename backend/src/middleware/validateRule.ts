/**
 * Rule Validation Middleware
 * Validates rule overwrite creation and update requests
 */

import { Request, Response, NextFunction } from 'express';
import { Platform, VersionOperator } from '../types/config.types';
import { isValidVersion } from '../utils/semver';
import { isValidCountryCode } from '../utils/geoip';
import logger from '../utils/logger';

const VALID_PLATFORMS: Platform[] = ['iOS', 'Android', 'Web'];
const VALID_OPERATORS: VersionOperator[] = [
  'equal',
  'not_equal',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
];
const MAX_RULES_PER_CONFIG = 30;

/**
 * Validates platform condition
 */
export function validatePlatformCondition(
  platform: string | undefined
): { valid: boolean; error?: string } {
  if (!platform) return { valid: true }; // Optional

  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    return {
      valid: false,
      error: `platformCondition must be one of: ${VALID_PLATFORMS.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates version operator and value
 */
export function validateVersionCondition(
  operator: string | undefined,
  version: string | undefined
): { valid: boolean; error?: string } {
  // Both must be present together
  if ((operator && !version) || (!operator && version)) {
    return {
      valid: false,
      error: 'versionOperator and versionValue must both be provided or both be null',
    };
  }

  if (!operator || !version) return { valid: true }; // Optional

  if (!VALID_OPERATORS.includes(operator as VersionOperator)) {
    return {
      valid: false,
      error: `versionOperator must be one of: ${VALID_OPERATORS.join(', ')}`,
    };
  }

  if (!isValidVersion(version)) {
    return {
      valid: false,
      error: `versionValue must be a valid semantic version (e.g., 1.0.0)`,
    };
  }

  return { valid: true };
}

/**
 * Validates country condition
 */
export function validateCountryCondition(
  country: string | undefined
): { valid: boolean; error?: string } {
  if (!country) return { valid: true }; // Optional

  if (!isValidCountryCode(country)) {
    return {
      valid: false,
      error: `countryCondition must be a valid ISO 3166-1 alpha-2 code (e.g., US, DE, GB)`,
    };
  }

  return { valid: true };
}

/**
 * Validates date conditions
 */
export function validateDateConditions(
  activeAfter: string | undefined,
  activeBetweenStart: string | undefined,
  activeBetweenEnd: string | undefined
): { valid: boolean; error?: string } {
  // Validate dates are ISO strings
  if (activeAfter) {
    const date = new Date(activeAfter);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'activeAfter must be a valid ISO timestamp' };
    }
  }

  if (activeBetweenStart) {
    const date = new Date(activeBetweenStart);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'activeBetweenStart must be a valid ISO timestamp' };
    }
  }

  if (activeBetweenEnd) {
    const date = new Date(activeBetweenEnd);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'activeBetweenEnd must be a valid ISO timestamp' };
    }
  }

  // Validate activeBetween is a proper range
  if (activeBetweenStart && activeBetweenEnd) {
    const start = new Date(activeBetweenStart);
    const end = new Date(activeBetweenEnd);

    if (end <= start) {
      return {
        valid: false,
        error: 'activeBetweenEnd must be after activeBetweenStart',
      };
    }
  }

  return { valid: true };
}

/**
 * Validates override value type matches config data type
 */
export function validateOverrideValueType(
  value: unknown,
  configDataType: string
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    return { valid: false, error: 'overrideValue cannot be null or undefined' };
  }

  switch (configDataType) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: 'overrideValue must be a string to match config dataType' };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value as number)) {
        return {
          valid: false,
          error: 'overrideValue must be a valid number to match config dataType',
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'overrideValue must be a boolean to match config dataType' };
      }
      break;

    case 'json':
      if (typeof value !== 'object') {
        return { valid: false, error: 'overrideValue must be JSON to match config dataType' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validates priority is valid
 */
export function validatePriority(priority: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(priority)) {
    return { valid: false, error: 'priority must be an integer' };
  }

  if (priority < 1) {
    return { valid: false, error: 'priority must be >= 1' };
  }

  if (priority > 1000) {
    return { valid: false, error: 'priority must be <= 1000' };
  }

  return { valid: true };
}

/**
 * Express middleware to validate rule creation/update requests
 */
export function validateRuleMiddleware(req: Request, res: Response, next: NextFunction) {
  const {
    priority,
    overrideValue,
    platformCondition,
    versionOperator,
    versionValue,
    countryCondition,
    segmentCondition,
    activeAfter,
    activeBetweenStart,
    activeBetweenEnd,
  } = req.body;

  // Validate priority (required for POST, optional for PUT)
  if (req.method === 'POST') {
    if (priority === undefined) {
      return res.status(400).json({
        success: false,
        error: 'priority is required',
      });
    }

    const priorityValidation = validatePriority(priority);
    if (!priorityValidation.valid) {
      return res.status(400).json({
        success: false,
        error: priorityValidation.error,
      });
    }
  }

  // Validate conditions
  const platformValidation = validatePlatformCondition(platformCondition);
  if (!platformValidation.valid) {
    return res.status(400).json({ success: false, error: platformValidation.error });
  }

  const versionValidation = validateVersionCondition(versionOperator, versionValue);
  if (!versionValidation.valid) {
    return res.status(400).json({ success: false, error: versionValidation.error });
  }

  const countryValidation = validateCountryCondition(countryCondition);
  if (!countryValidation.valid) {
    return res.status(400).json({ success: false, error: countryValidation.error });
  }

  const dateValidation = validateDateConditions(
    activeAfter,
    activeBetweenStart,
    activeBetweenEnd
  );
  if (!dateValidation.valid) {
    return res.status(400).json({ success: false, error: dateValidation.error });
  }

  logger.debug('Rule validation passed', { priority, platformCondition });
  next();
}

/**
 * Validates segment condition format
 */
export function validateSegmentCondition(
  segment: string | undefined
): { valid: boolean; error?: string } {
  if (!segment) return { valid: true }; // Optional

  // Segments are custom IDs, just check they're non-empty strings
  if (typeof segment !== 'string' || segment.length === 0) {
    return { valid: false, error: 'segmentCondition must be a non-empty string' };
  }

  return { valid: true };
}

/**
 * Validates max rules constraint for a config
 */
export function validateMaxRules(
  currentRuleCount: number
): { valid: boolean; error?: string } {
  if (currentRuleCount >= MAX_RULES_PER_CONFIG) {
    return {
      valid: false,
      error: `Config has reached maximum of ${MAX_RULES_PER_CONFIG} rules`,
    };
  }

  return { valid: true };
}

/**
 * Validates unique priority constraint
 */
export function validateUniquePriority(
  priority: number,
  existingPriorities: number[],
  excludeRuleId?: string
): { valid: boolean; error?: string } {
  if (existingPriorities.includes(priority)) {
    return {
      valid: false,
      error: `priority ${priority} is already in use for this config`,
    };
  }

  return { valid: true };
}

