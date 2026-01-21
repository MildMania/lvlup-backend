/**
 * Validation Rule Service
 * Handles validation rule management and execution
 * Phase 4: User Story 2 - Advanced Config Validation
 */

import { PrismaClient } from '@prisma/client';
import { ValidationRule, ValidationRuleType } from '../types/config.types';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Creates validation rules for a config
 */
export async function createValidationRules(
  configId: string,
  rules: Array<{ ruleType: ValidationRuleType; ruleValue: string }>
): Promise<ValidationRule[]> {
  try {
    const created = await Promise.all(
      rules.map((rule) =>
        prisma.validationRule.create({
          data: {
            configId,
            ruleType: rule.ruleType,
            ruleValue: rule.ruleValue,
          },
        })
      )
    );

    logger.debug(`Created ${created.length} validation rules for config ${configId}`);
    return created as ValidationRule[];
  } catch (error) {
    logger.error('Failed to create validation rules:', error);
    throw error;
  }
}

/**
 * Gets validation rules for a config
 */
export async function getValidationRules(configId: string): Promise<ValidationRule[]> {
  try {
    const rules = await prisma.validationRule.findMany({
      where: { configId },
    });

    return rules as ValidationRule[];
  } catch (error) {
    logger.error('Failed to get validation rules:', error);
    throw error;
  }
}

/**
 * Deletes validation rules for a config
 */
export async function deleteValidationRules(configId: string): Promise<number> {
  try {
    const result = await prisma.validationRule.deleteMany({
      where: { configId },
    });

    logger.debug(`Deleted ${result.count} validation rules for config ${configId}`);
    return result.count;
  } catch (error) {
    logger.error('Failed to delete validation rules:', error);
    throw error;
  }
}

/**
 * Validates a value against configured rules
 */
export async function validateValueAgainstRules(
  configId: string,
  value: unknown,
  dataType: string
): Promise<{ valid: boolean; errors?: string[] }> {
  try {
    const rules = await getValidationRules(configId);

    if (rules.length === 0) {
      return { valid: true };
    }

    const errors: string[] = [];

    for (const rule of rules) {
      const ruleError = validateAgainstRule(value, dataType, rule.ruleType, rule.ruleValue);
      if (ruleError) {
        errors.push(ruleError);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  } catch (error) {
    logger.error('Failed to validate value against rules:', error);
    return { valid: false, errors: ['Validation check failed'] };
  }
}

/**
 * Validates a value against a single rule
 */
function validateAgainstRule(
  value: unknown,
  dataType: string,
  ruleType: ValidationRuleType,
  ruleValue: string
): string | null {
  try {
    switch (ruleType) {
      case 'min':
        if (dataType === 'number' && typeof value === 'number') {
          const min = parseFloat(ruleValue);
          if (value < min) {
            return `Value must be at least ${min}`;
          }
        }
        break;

      case 'max':
        if (dataType === 'number' && typeof value === 'number') {
          const max = parseFloat(ruleValue);
          if (value > max) {
            return `Value must be at most ${max}`;
          }
        }
        break;

      case 'regex':
        if (dataType === 'string' && typeof value === 'string') {
          try {
            const regex = new RegExp(ruleValue);
            if (!regex.test(value)) {
              return `Value does not match required pattern: ${ruleValue}`;
            }
          } catch {
            logger.error(`Invalid regex pattern: ${ruleValue}`);
            return `Regex validation failed`;
          }
        }
        break;

      case 'maxLength':
        if (dataType === 'string' && typeof value === 'string') {
          const maxLength = parseInt(ruleValue, 10);
          if (value.length > maxLength) {
            return `Value length must be at most ${maxLength} characters`;
          }
        }
        break;
    }

    return null;
  } catch (error) {
    logger.error(`Rule validation error: ${error}`);
    return null;
  }
}

/**
 * Applies validation rules from one config to another (for copying)
 */
export async function copyValidationRules(
  sourceConfigId: string,
  targetConfigId: string
): Promise<number> {
  try {
    const sourceRules = await getValidationRules(sourceConfigId);

    if (sourceRules.length === 0) {
      return 0;
    }

    const created = await createValidationRules(
      targetConfigId,
      sourceRules.map((r) => ({
        ruleType: r.ruleType,
        ruleValue: r.ruleValue,
      }))
    );

    return created.length;
  } catch (error) {
    logger.error('Failed to copy validation rules:', error);
    throw error;
  }
}

