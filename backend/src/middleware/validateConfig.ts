/**
 * Config Validation Middleware
 * Validates remote config creation and update requests
 */

import { Request, Response, NextFunction } from 'express';
import { ConfigDataType } from '../types/config.types';
import logger from '../utils/logger';

/**
 * Validates config key format
 * - Alphanumeric + underscore only
 * - Max 64 characters
 */
export function validateKeyFormat(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Key is required and must be a string' };
  }

  if (key.length > 64) {
    return { valid: false, error: 'Key must be max 64 characters' };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(key)) {
    return {
      valid: false,
      error: 'Key must contain only alphanumeric characters and underscores',
    };
  }

  return { valid: true };
}

/**
 * Validates data type
 */
export function validateDataType(dataType: string): { valid: boolean; error?: string } {
  if (!dataType) {
    return { valid: false, error: 'dataType is required' };
  }

  const validTypes: ConfigDataType[] = ['string', 'number', 'boolean', 'json'];
  if (!validTypes.includes(dataType as ConfigDataType)) {
    return {
      valid: false,
      error: `dataType must be one of: ${validTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates config value matches data type
 */
export function validateValueType(
  value: unknown,
  dataType: ConfigDataType
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    return { valid: false, error: 'Value cannot be null or undefined' };
  }

  switch (dataType) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string' };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: 'Value must be a valid number' };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Value must be a boolean' };
      }
      break;

    case 'json':
      if (typeof value !== 'object' || Array.isArray(value) === false && !isValidJSON(value)) {
        return { valid: false, error: 'Value must be valid JSON' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validates JSON structure
 */
export function isValidJSON(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== 'object') return false;

  try {
    JSON.stringify(obj);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates max value size (100KB)
 */
export function validateValueSize(value: unknown): { valid: boolean; error?: string } {
  const maxSize = 100 * 1024; // 100KB
  const size = JSON.stringify(value).length;

  if (size > maxSize) {
    return {
      valid: false,
      error: `Value size ${size} bytes exceeds maximum ${maxSize} bytes`,
    };
  }

  return { valid: true };
}

/**
 * Validates numeric range for number types
 */
export function validateNumberRange(
  value: number,
  min?: number,
  max?: number
): { valid: boolean; error?: string } {
  if (min !== undefined && value < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }

  if (max !== undefined && value > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }

  return { valid: true };
}

/**
 * Validates string pattern with regex
 */
export function validateStringPattern(
  value: string,
  pattern: string
): { valid: boolean; error?: string } {
  try {
    const regex = new RegExp(pattern);
    if (!regex.test(value)) {
      return {
        valid: false,
        error: `Value does not match required pattern: ${pattern}`,
      };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Invalid regex pattern: ${pattern}` };
  }
}

/**
 * Express middleware to validate config creation/update requests
 */
export function validateConfigMiddleware(req: Request, res: Response, next: NextFunction) {
  const { gameId, key, value, dataType, environment } = req.body;

  // Validate gameId
  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'gameId is required',
    });
  }

  // Skip key validation for updates (PUT)
  if (req.method === 'POST') {
    // Validate key
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'key is required',
      });
    }

    const keyValidation = validateKeyFormat(key);
    if (!keyValidation.valid) {
      return res.status(400).json({
        success: false,
        error: keyValidation.error,
      });
    }
  }

  // For both POST and PUT, validate dataType and value
  if (req.method === 'POST' || (req.method === 'PUT' && value !== undefined)) {
    if (dataType) {
      const typeValidation = validateDataType(dataType);
      if (!typeValidation.valid) {
        return res.status(400).json({
          success: false,
          error: typeValidation.error,
        });
      }
    }

    if (value !== undefined && dataType) {
      const valueTypeValidation = validateValueType(value, dataType as ConfigDataType);
      if (!valueTypeValidation.valid) {
        return res.status(400).json({
          success: false,
          error: valueTypeValidation.error,
        });
      }

      const sizeValidation = validateValueSize(value);
      if (!sizeValidation.valid) {
        return res.status(400).json({
          success: false,
          error: sizeValidation.error,
        });
      }
    }
  }

  logger.debug('Config validation passed', { gameId, key });
  next();
}

/**
 * Validates environment parameter
 */
export function validateEnvironment(environment: string): { valid: boolean; error?: string } {
  const validEnvironments = ['development', 'staging', 'production'];

  if (!environment) {
    return { valid: false, error: 'environment is required' };
  }

  if (!validEnvironments.includes(environment)) {
    return {
      valid: false,
      error: `environment must be one of: ${validEnvironments.join(', ')}`,
    };
  }

  return { valid: true };
}

