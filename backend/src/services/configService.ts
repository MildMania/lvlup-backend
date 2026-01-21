/**
 * Config Service
 * Business logic for Remote Config CRUD operations
 * Handles config creation, updates, deletion with cache invalidation
 */

import { PrismaClient } from '@prisma/client';
import {
  RemoteConfig,
  CreateConfigInput,
  UpdateConfigInput,
  CreateRuleInput,
  UpdateRuleInput,
  ReorderRulesInput,
  ConfigChangeType,
  RuleAction,
  ValidationRule,
  CreateValidationRuleInput,
} from '../types/config.types';
import {
  invalidateGameCache,
  generateCachePattern,
  invalidateCachePattern,
} from './CacheService';
import {
  DuplicateConfigKeyError,
  DuplicateRulePriorityError,
  MaxRulesExceededError,
  ConfigValueTooLargeError,
  ConfigNotFoundError,
  RuleNotFoundError,
} from '../types/config.types';
import logger from '../utils/logger';

const prisma = new PrismaClient();
const MAX_RULES_PER_CONFIG = 30;
const MAX_VALUE_SIZE = 100 * 1024; // 100KB

/**
 * Creates a new remote config
 * @param input Config creation input
 * @param changedBy User ID making the change
 * @returns Created config
 * @throws DuplicateConfigKeyError if key already exists
 * @throws ConfigValueTooLargeError if value exceeds size limit
 */
export async function createConfig(
  input: CreateConfigInput,
  changedBy: string = 'system'
): Promise<RemoteConfig> {
  // Validate value size
  const valueSize = JSON.stringify(input.value).length;
  if (valueSize > MAX_VALUE_SIZE) {
    throw new ConfigValueTooLargeError(valueSize, MAX_VALUE_SIZE);
  }

  // Check for duplicate key
  const existing = await prisma.remoteConfig.findUnique({
    where: {
      gameId_key_environment: {
        gameId: input.gameId,
        key: input.key,
        environment: input.environment,
      },
    },
  });

  if (existing) {
    throw new DuplicateConfigKeyError(input.key, input.environment);
  }

  try {
    // Create config
    const config = await prisma.remoteConfig.create({
      data: {
        gameId: input.gameId,
        key: input.key,
        value: input.value as any,
        dataType: input.dataType,
        environment: input.environment,
        enabled: input.enabled ?? true,
        description: input.description,
      },
    });

    // Create validation rules if provided
    if (input.validationRules && input.validationRules.length > 0) {
      await Promise.all(
        input.validationRules.map((rule) =>
          prisma.validationRule.create({
            data: {
              configId: config.id,
              ruleType: rule.ruleType,
              ruleValue: rule.ruleValue,
            },
          })
        )
      );
    }

    // Record history
    await prisma.configHistory.create({
      data: {
        configId: config.id,
        changeType: 'created',
        newValue: config.value as any,
        changedBy,
      },
    });

    // Invalidate cache
    await invalidateGameCache(input.gameId, input.environment);

    logger.debug(`Config created: ${config.id}`, {
      gameId: input.gameId,
      key: input.key,
      environment: input.environment,
    });

    return config as RemoteConfig;
  } catch (error) {
    if (
      error instanceof DuplicateConfigKeyError ||
      error instanceof ConfigValueTooLargeError
    ) {
      throw error;
    }
    logger.error('Failed to create config:', error);
    throw error;
  }
}

/**
 * Updates an existing config
 * @param configId Config ID to update
 * @param input Update input
 * @param changedBy User ID making the change
 * @returns Updated config
 * @throws ConfigNotFoundError if config doesn't exist
 * @throws ConfigValueTooLargeError if value exceeds size limit
 */
export async function updateConfig(
  configId: string,
  input: UpdateConfigInput,
  changedBy: string = 'system'
): Promise<RemoteConfig> {
  // Get existing config
  const existing = await prisma.remoteConfig.findUnique({
    where: { id: configId },
  });

  if (!existing) {
    throw new ConfigNotFoundError(configId);
  }

  // Validate new value size if provided
  if (input.value !== undefined) {
    const valueSize = JSON.stringify(input.value).length;
    if (valueSize > MAX_VALUE_SIZE) {
      throw new ConfigValueTooLargeError(valueSize, MAX_VALUE_SIZE);
    }
  }

  try {
    // Update config
    const updated = await prisma.remoteConfig.update({
      where: { id: configId },
      data: {
        value: input.value as any,
        enabled: input.enabled,
        description: input.description,
      },
    });

    // Update validation rules if provided
    if (input.validationRules) {
      // Delete existing rules
      await prisma.validationRule.deleteMany({
        where: { configId },
      });

      // Create new rules
      if (input.validationRules.length > 0) {
        await Promise.all(
          input.validationRules.map((rule) =>
            prisma.validationRule.create({
              data: {
                configId,
                ruleType: rule.ruleType,
                ruleValue: rule.ruleValue,
              },
            })
          )
        );
      }
    }

    // Record history
    await prisma.configHistory.create({
      data: {
        configId,
        changeType: 'updated',
        previousValue: existing.value as any,
        newValue: updated.value as any,
        changedBy,
      },
    });

    // Invalidate cache
    await invalidateGameCache(existing.gameId, existing.environment);

    logger.debug(`Config updated: ${configId}`, {
      gameId: existing.gameId,
      key: existing.key,
    });

    return updated as RemoteConfig;
  } catch (error) {
    if (error instanceof ConfigValueTooLargeError) {
      throw error;
    }
    logger.error('Failed to update config:', error);
    throw error;
  }
}

/**
 * Deletes a config
 * @param configId Config ID to delete
 * @param changedBy User ID making the change
 * @throws ConfigNotFoundError if config doesn't exist
 */
export async function deleteConfig(
  configId: string,
  changedBy: string = 'system'
): Promise<void> {
  // Get config before deletion
  const config = await prisma.remoteConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    throw new ConfigNotFoundError(configId);
  }

  try {
    // Record history
    await prisma.configHistory.create({
      data: {
        configId,
        changeType: 'deleted',
        previousValue: config.value as any,
        newValue: {} as any,
        changedBy,
      },
    });

    // Delete config (cascade will delete rules, history, validation rules)
    await prisma.remoteConfig.delete({
      where: { id: configId },
    });

    // Invalidate cache
    await invalidateGameCache(config.gameId, config.environment);

    logger.debug(`Config deleted: ${configId}`, {
      gameId: config.gameId,
      key: config.key,
    });
  } catch (error) {
    logger.error('Failed to delete config:', error);
    throw error;
  }
}

/**
 * Gets all configs for a game and environment
 * @param gameId Game ID
 * @param environment Environment (optional, defaults to production)
 * @returns Array of configs
 */
export async function getConfigs(
  gameId: string,
  environment: string = 'production'
): Promise<RemoteConfig[]> {
  const configs = await prisma.remoteConfig.findMany({
    where: {
      gameId,
      environment,
    },
    include: {
      rules: {
        where: { enabled: true },
        orderBy: { priority: 'asc' },
      },
      validationRules: true,
    },
  });

  return configs as RemoteConfig[];
}

/**
 * Gets a single config by ID
 * @param configId Config ID
 * @returns Config or null if not found
 */
export async function getConfig(configId: string): Promise<RemoteConfig | null> {
  const config = await prisma.remoteConfig.findUnique({
    where: { id: configId },
    include: {
      rules: {
        orderBy: { priority: 'asc' },
      },
      validationRules: true,
    },
  });

  return config as RemoteConfig | null;
}

/**
 * Creates a rule override for a config
 * @param input Rule creation input
 * @param changedBy User ID making the change
 * @returns Created rule
 * @throws ConfigNotFoundError if config doesn't exist
 * @throws DuplicateRulePriorityError if priority already exists
 * @throws MaxRulesExceededError if config already has max rules
 */
export async function createRule(
  input: CreateRuleInput,
  changedBy: string = 'system'
): Promise<any> {
  // Check config exists
  const config = await prisma.remoteConfig.findUnique({
    where: { id: input.configId },
    include: { rules: true },
  });

  if (!config) {
    throw new ConfigNotFoundError(input.configId);
  }

  // Check max rules not exceeded
  if (config.rules.length >= MAX_RULES_PER_CONFIG) {
    throw new MaxRulesExceededError(input.configId, MAX_RULES_PER_CONFIG);
  }

  // Check priority not duplicate
  const existingPriority = config.rules.find((r) => r.priority === input.priority);
  if (existingPriority) {
    throw new DuplicateRulePriorityError(input.priority, input.configId);
  }

  try {
    const rule = await prisma.ruleOverwrite.create({
      data: {
        configId: input.configId,
        priority: input.priority,
        enabled: input.enabled ?? true,
        overrideValue: input.overrideValue as any,
        platformCondition: input.platformCondition,
        versionOperator: input.versionOperator,
        versionValue: input.versionValue,
        countryCondition: input.countryCondition,
        segmentCondition: input.segmentCondition,
        activeAfter: input.activeAfter,
        activeBetweenStart: input.activeBetweenStart,
        activeBetweenEnd: input.activeBetweenEnd,
      },
    });

    // Record history
    await prisma.ruleHistory.create({
      data: {
        ruleId: rule.id,
        configId: input.configId,
        action: 'created',
        newState: rule as any,
        changedBy,
      },
    });

    // Invalidate cache
    await invalidateGameCache(config.gameId, config.environment);

    logger.debug(`Rule created: ${rule.id}`, {
      configId: input.configId,
      priority: input.priority,
    });

    return rule;
  } catch (error) {
    if (
      error instanceof MaxRulesExceededError ||
      error instanceof DuplicateRulePriorityError
    ) {
      throw error;
    }
    logger.error('Failed to create rule:', error);
    throw error;
  }
}

/**
 * Updates a rule override
 * @param ruleId Rule ID to update
 * @param input Update input
 * @param changedBy User ID making the change
 * @returns Updated rule
 * @throws RuleNotFoundError if rule doesn't exist
 */
export async function updateRule(
  ruleId: string,
  input: UpdateRuleInput,
  changedBy: string = 'system'
): Promise<any> {
  // Get existing rule
  const existing = await prisma.ruleOverwrite.findUnique({
    where: { id: ruleId },
  });

  if (!existing) {
    throw new RuleNotFoundError(ruleId);
  }

  // Check for priority conflict if changing priority
  if (input.priority !== undefined && input.priority !== existing.priority) {
    const conflicting = await prisma.ruleOverwrite.findFirst({
      where: {
        configId: existing.configId,
        priority: input.priority,
        NOT: { id: ruleId },
      },
    });

    if (conflicting) {
      throw new DuplicateRulePriorityError(input.priority, existing.configId);
    }
  }

  try {
    const updated = await prisma.ruleOverwrite.update({
      where: { id: ruleId },
      data: {
        priority: input.priority,
        enabled: input.enabled,
        overrideValue: input.overrideValue as any,
        platformCondition: input.platformCondition,
        versionOperator: input.versionOperator,
        versionValue: input.versionValue,
        countryCondition: input.countryCondition,
        segmentCondition: input.segmentCondition,
        activeAfter: input.activeAfter,
        activeBetweenStart: input.activeBetweenStart,
        activeBetweenEnd: input.activeBetweenEnd,
      },
    });

    // Record history
    await prisma.ruleHistory.create({
      data: {
        ruleId,
        configId: existing.configId,
        action: 'updated',
        previousState: existing as any,
        newState: updated as any,
        changedBy,
      },
    });

    // Get config for cache invalidation
    const config = await prisma.remoteConfig.findUnique({
      where: { id: existing.configId },
    });

    if (config) {
      await invalidateGameCache(config.gameId, config.environment);
    }

    logger.debug(`Rule updated: ${ruleId}`, {
      configId: existing.configId,
      priority: updated.priority,
    });

    return updated;
  } catch (error) {
    if (error instanceof DuplicateRulePriorityError) {
      throw error;
    }
    logger.error('Failed to update rule:', error);
    throw error;
  }
}

/**
 * Deletes a rule override
 * @param ruleId Rule ID to delete
 * @param changedBy User ID making the change
 * @throws RuleNotFoundError if rule doesn't exist
 */
export async function deleteRule(
  ruleId: string,
  changedBy: string = 'system'
): Promise<void> {
  // Get rule before deletion
  const rule = await prisma.ruleOverwrite.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    throw new RuleNotFoundError(ruleId);
  }

  try {
    // Record history
    await prisma.ruleHistory.create({
      data: {
        ruleId,
        configId: rule.configId,
        action: 'deleted',
        previousState: rule,
        changedBy,
      },
    });

    // Delete rule
    await prisma.ruleOverwrite.delete({
      where: { id: ruleId },
    });

    // Get config for cache invalidation
    const config = await prisma.remoteConfig.findUnique({
      where: { id: rule.configId },
    });

    if (config) {
      await invalidateGameCache(config.gameId, config.environment);
    }

    logger.debug(`Rule deleted: ${ruleId}`, {
      configId: rule.configId,
      priority: rule.priority,
    });
  } catch (error) {
    logger.error('Failed to delete rule:', error);
    throw error;
  }
}

/**
 * Reorders rules for a config
 * @param input Reorder rules input
 * @param changedBy User ID making the change
 * @throws ConfigNotFoundError if config doesn't exist
 */
export async function reorderRules(
  input: ReorderRulesInput,
  changedBy: string = 'system'
): Promise<void> {
  // Check config exists
  const config = await prisma.remoteConfig.findUnique({
    where: { id: input.configId },
  });

  if (!config) {
    throw new ConfigNotFoundError(input.configId);
  }

  try {
    // Update all rules with new priorities
    await Promise.all(
      input.ruleOrder.map((order) =>
        prisma.ruleOverwrite.update({
          where: { id: order.ruleId },
          data: { priority: order.newPriority },
        })
      )
    );

    // Record history for each rule
    await Promise.all(
      input.ruleOrder.map((order) =>
        prisma.ruleHistory.create({
          data: {
            ruleId: order.ruleId,
            configId: input.configId,
            action: 'reordered',
            newState: { priority: order.newPriority },
            changedBy,
          },
        })
      )
    );

    // Invalidate cache
    await invalidateGameCache(config.gameId, config.environment);

    logger.debug(`Rules reordered: ${input.configId}`, {
      totalRules: input.ruleOrder.length,
    });
  } catch (error) {
    logger.error('Failed to reorder rules:', error);
    throw error;
  }
}

