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
/**
 * Validates version format (semantic version)
 */
export function validateVersionFormat(version: string | undefined): { valid: boolean; error?: string } {
  if (!version) return { valid: true }; // Optional

  if (!isValidVersion(version)) {
    return {
      valid: false,
      error: `Version must be a valid semantic version (e.g., 1.0.0)`,
    };
  }

  return { valid: true };
}

/**
 * Validates version condition (operator + value)
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
 * Validates country condition (T107)
 * Validates ISO 3166-1 alpha-2 country codes
 */
export function validateCountryCondition(
  country: string | null | undefined
): { valid: boolean; error?: string } {
  if (!country) {
    return { valid: true }; // Country is optional
  }

  // ISO 3166-1 alpha-2 format: exactly 2 uppercase letters
  const countryCodeRegex = /^[A-Z]{2}$/;

  if (!countryCodeRegex.test(country)) {
    return {
      valid: false,
      error: `country must be ISO 3166-1 alpha-2 code (e.g., US, DE, JP), got: ${country}`,
    };
  }

  return { valid: true };
}

/**
 * Validates date conditions (T108)
 * Validates activeAfter and activeBetween dates
 */
export function validateDateConditions(
  activeAfter: string | Date | null | undefined,
  activeBetweenStart: string | Date | null | undefined,
  activeBetweenEnd: string | Date | null | undefined
): { valid: boolean; error?: string } {
  // Convert to Date objects if they're strings
  const after = activeAfter ? new Date(activeAfter) : null;
  const betweenStart = activeBetweenStart ? new Date(activeBetweenStart) : null;
  const betweenEnd = activeBetweenEnd ? new Date(activeBetweenEnd) : null;

  // Validate activeAfter is valid date
  if (after && isNaN(after.getTime())) {
    return {
      valid: false,
      error: 'activeAfter must be a valid ISO 8601 date',
    };
  }

  // Validate activeBetweenStart is valid date
  if (betweenStart && isNaN(betweenStart.getTime())) {
    return {
      valid: false,
      error: 'activeBetweenStart must be a valid ISO 8601 date',
    };
  }

  // Validate activeBetweenEnd is valid date
  if (betweenEnd && isNaN(betweenEnd.getTime())) {
    return {
      valid: false,
      error: 'activeBetweenEnd must be a valid ISO 8601 date',
    };
  }

  // Validate activeBetween end is after start (T109)
  if (betweenStart && betweenEnd) {
    if (betweenEnd <= betweenStart) {
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
    platformConditions,
    countryConditions,
    segmentConditions,
    activeBetweenStart,
    activeBetweenEnd,
  } = req.body;

  // Validate overrideValue is present (required for both POST and PUT)
  if (overrideValue === undefined || overrideValue === null) {
    return res.status(400).json({
      success: false,
      error: 'overrideValue is required',
    });
  }

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
  // Validate platform conditions array (optional, but if provided must be valid)
  if (platformConditions) {
    if (!Array.isArray(platformConditions)) {
      return res.status(400).json({ 
        success: false, 
        error: 'platformConditions must be an array' 
      });
    }
    for (const platformCond of platformConditions) {
      // Validate platform name
      const platformValidation = validatePlatformCondition(platformCond.platform);
      if (!platformValidation.valid) {
        return res.status(400).json({ success: false, error: platformValidation.error });
      }
      
      // Validate minVersion if provided
      if (platformCond.minVersion) {
        const minVersionValidation = validateVersionFormat(platformCond.minVersion);
        if (!minVersionValidation.valid) {
          return res.status(400).json({ success: false, error: `${platformCond.platform} minVersion: ${minVersionValidation.error}` });
        }
      }
      
      // Validate maxVersion if provided
      if (platformCond.maxVersion) {
        const maxVersionValidation = validateVersionFormat(platformCond.maxVersion);
        if (!maxVersionValidation.valid) {
          return res.status(400).json({ success: false, error: `${platformCond.platform} maxVersion: ${maxVersionValidation.error}` });
        }
      }
    }
  }

  // Validate country conditions array (optional, but if provided must be valid)
  if (countryConditions) {
    if (!Array.isArray(countryConditions)) {
      return res.status(400).json({ 
        success: false, 
        error: 'countryConditions must be an array' 
      });
    }
    for (const country of countryConditions) {
      const countryValidation = validateCountryCondition(country);
      if (!countryValidation.valid) {
        return res.status(400).json({ success: false, error: countryValidation.error });
      }
    }
  }

  // Validate segment conditions array (optional, but if provided must be valid)
  if (segmentConditions) {
    if (!Array.isArray(segmentConditions)) {
      return res.status(400).json({ 
        success: false, 
        error: 'segmentConditions must be an array' 
      });
    }
    for (const segment of segmentConditions) {
      const segmentValidation = validateSegmentCondition(segment);
      if (!segmentValidation.valid) {
        return res.status(400).json({ success: false, error: segmentValidation.error });
      }
    }
  }

  const dateValidation = validateDateConditions(
    activeBetweenStart,
    activeBetweenEnd
  );
  if (!dateValidation.valid) {
    return res.status(400).json({ success: false, error: dateValidation.error });
  }

  logger.debug('Rule validation passed', { priority, platformConditions });
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

