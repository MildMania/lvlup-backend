/**
 * Rule Controller
 * Handles rule overwrite CRUD operations
 * Phase 6: User Story 4 - Platform-Specific Rule Overwrites
 */

import { Request, Response } from 'express';
import * as configService from '../services/ConfigService';
import { CreateRuleInput, UpdateRuleInput } from '../types/config.types';
import logger from '../utils/logger';

/**
 * POST /api/admin/configs/:configId/rules
 * Create a new rule for a config (T092)
 */
export async function createRule(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId } = req.params;
    const {
      priority,
      overrideValue,
      enabled,
      platformConditions,
      countryConditions,
      segmentConditions,
      activeBetweenStart,
      activeBetweenEnd,
    } = req.body;

    if (!configId) {
      res.status(400).json({
        success: false,
        error: 'configId is required',
      });
      return;
    }

    if (priority === undefined) {
      res.status(400).json({
        success: false,
        error: 'priority is required',
      });
      return;
    }

    if (overrideValue === undefined) {
      res.status(400).json({
        success: false,
        error: 'overrideValue is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Creating rule with request body:', {
      configId,
      priority,
      platformConditions,
      platformConditionsType: typeof platformConditions,
      platformConditionsIsArray: Array.isArray(platformConditions),
      countryConditions,
      segmentConditions,
    });

    // Create rule
    const rule = await configService.createRule(
      {
        configId,
        priority,
        overrideValue,
        enabled: enabled !== false,
        platformConditions,
        countryConditions,
        segmentConditions,
        activeBetweenStart,
        activeBetweenEnd,
      },
      userId
    );

    logger.info('Rule created successfully', {
      ruleId: rule.id,
      configId,
      priority,
      savedPlatformConditions: rule.platformConditions,
      savedPlatformConditionsType: typeof rule.platformConditions,
      savedPlatformConditionsIsArray: Array.isArray(rule.platformConditions),
      userId,
    });

    res.status(201).json({
      success: true,
      data: {
        id: rule.id,
        configId: rule.configId,
        priority: rule.priority,
        overrideValue: rule.overrideValue,
        enabled: rule.enabled,
        platformConditions: Array.isArray(rule.platformConditions) ? rule.platformConditions : (rule.platformConditions ? [rule.platformConditions] : null),
        countryConditions: Array.isArray(rule.countryConditions) ? rule.countryConditions : (rule.countryConditions ? [rule.countryConditions] : null),
        segmentConditions: Array.isArray(rule.segmentConditions) ? rule.segmentConditions : (rule.segmentConditions ? [rule.segmentConditions] : null),
        activeBetweenStart: rule.activeBetweenStart?.toISOString() || null,
        activeBetweenEnd: rule.activeBetweenEnd?.toISOString() || null,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to create rule:', error);

    if (error instanceof Error) {
      if (error.name === 'DuplicateRulePriorityError') {
        res.status(409).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.name === 'MaxRulesExceededError') {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.name === 'ConfigNotFoundError') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create rule',
    });
  }
}

/**
 * GET /api/admin/configs/:configId/rules
 * List all rules for a config
 */
export async function listRules(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId } = req.params;

    if (!configId) {
      res.status(400).json({
        success: false,
        error: 'configId is required',
      });
      return;
    }

    // Get config with rules
    const config = await configService.getConfig(configId);

    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Config not found',
      });
      return;
    }

    logger.info('Rules listed', {
      configId,
      count: config.rules?.length || 0,
      firstRulePlatformConditions: config.rules?.[0]?.platformConditions,
      firstRulePlatformConditionsType: typeof config.rules?.[0]?.platformConditions,
      firstRulePlatformConditionsIsArray: Array.isArray(config.rules?.[0]?.platformConditions),
      allRules: config.rules?.map((r) => ({
        id: r.id,
        platformConditions: r.platformConditions,
        platformConditionsRaw: JSON.stringify(r.platformConditions),
      })),
    });

    const mappedRules = (config.rules || []).map((rule) => {
      const mapped = {
        id: rule.id,
        priority: rule.priority,
        overrideValue: rule.overrideValue,
        enabled: rule.enabled,
        platformConditions: Array.isArray(rule.platformConditions) ? rule.platformConditions : (rule.platformConditions ? [rule.platformConditions] : null),
        countryConditions: Array.isArray(rule.countryConditions) ? rule.countryConditions : (rule.countryConditions ? [rule.countryConditions] : null),
        segmentConditions: Array.isArray(rule.segmentConditions) ? rule.segmentConditions : (rule.segmentConditions ? [rule.segmentConditions] : null),
        activeBetweenStart: rule.activeBetweenStart?.toISOString() || null,
        activeBetweenEnd: rule.activeBetweenEnd?.toISOString() || null,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      };
      logger.info('Mapped rule:', { originalPlatformConditions: rule.platformConditions, mappedPlatformConditions: mapped.platformConditions });
      return mapped;
    });

    res.status(200).json({
      success: true,
      data: {
        configId,
        rules: mappedRules,
        total: config.rules?.length || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to list rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list rules',
    });
  }
}

/**
 * PUT /api/admin/configs/:configId/rules/:ruleId
 * Update a rule (T093)
 */
export async function updateRule(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId, ruleId } = req.params;
    const {
      priority,
      overrideValue,
      enabled,
      platformConditions,
      countryConditions,
      segmentConditions,
      activeBetweenStart,
      activeBetweenEnd,
    } = req.body;

    if (!ruleId) {
      res.status(400).json({
        success: false,
        error: 'ruleId is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Updating rule with request body:', {
      ruleId,
      configId,
      platformConditions,
      platformConditionsType: typeof platformConditions,
      platformConditionsIsArray: Array.isArray(platformConditions),
      countryConditions,
      segmentConditions,
    });

    // Update rule
    const updated = await configService.updateRule(
      ruleId,
      {
        priority,
        overrideValue,
        enabled,
        platformConditions,
        countryConditions,
        segmentConditions,
        activeBetweenStart,
        activeBetweenEnd,
      },
      userId
    );

    logger.info('Rule updated successfully', {
      ruleId,
      configId,
      updatedPlatformConditions: updated.platformConditions,
      updatedPlatformConditionsType: typeof updated.platformConditions,
      updatedPlatformConditionsIsArray: Array.isArray(updated.platformConditions),
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        configId: updated.configId,
        priority: updated.priority,
        overrideValue: updated.overrideValue,
        enabled: updated.enabled,
        platformConditions: Array.isArray(updated.platformConditions) ? updated.platformConditions : (updated.platformConditions ? [updated.platformConditions] : null),
        countryConditions: Array.isArray(updated.countryConditions) ? updated.countryConditions : (updated.countryConditions ? [updated.countryConditions] : null),
        segmentConditions: Array.isArray(updated.segmentConditions) ? updated.segmentConditions : (updated.segmentConditions ? [updated.segmentConditions] : null),
        activeBetweenStart: updated.activeBetweenStart?.toISOString() || null,
        activeBetweenEnd: updated.activeBetweenEnd?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to update rule:', error);

    if (error instanceof Error) {
      if (error.name === 'RuleNotFoundError') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.name === 'DuplicateRulePriorityError') {
        res.status(409).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update rule',
    });
  }
}

/**
 * DELETE /api/admin/configs/:configId/rules/:ruleId
 * Delete a rule (T094)
 */
export async function deleteRule(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId, ruleId } = req.params;

    if (!ruleId) {
      res.status(400).json({
        success: false,
        error: 'ruleId is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    // Delete rule
    await configService.deleteRule(ruleId, userId);

    logger.info('Rule deleted', {
      ruleId,
      configId,
      userId,
    });

    res.status(200).json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete rule:', error);

    if (error instanceof Error) {
      if (error.name === 'RuleNotFoundError') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete rule',
    });
  }
}

/**
 * POST /api/admin/configs/:configId/rules/reorder
 * Reorder rules for a config
 */
export async function reorderRules(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId } = req.params;
    const { ruleOrder } = req.body;

    logger.info('Reorder request received:', {
      configId,
      requestBody: req.body,
      ruleOrder,
      ruleOrderType: typeof ruleOrder,
      isArray: Array.isArray(ruleOrder),
    });

    if (!configId) {
      res.status(400).json({
        success: false,
        error: 'configId is required',
      });
      return;
    }

    if (!ruleOrder || !Array.isArray(ruleOrder)) {
      logger.error('Invalid ruleOrder:', { ruleOrder, isArray: Array.isArray(ruleOrder) });
      res.status(400).json({
        success: false,
        error: 'ruleOrder array is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Calling configService.reorderRules with:', {
      configId,
      ruleOrderLength: ruleOrder.length,
      ruleOrderSample: ruleOrder.slice(0, 2),
    });

    // Reorder rules
    await configService.reorderRules(
      {
        configId,
        ruleOrder,
      },
      userId
    );

    logger.info('Rules reordered', {
      configId,
      count: ruleOrder.length,
      userId,
    });

    res.status(200).json({
      success: true,
      message: 'Rules reordered successfully',
    });
  } catch (error) {
    logger.error('Failed to reorder rules:', error);

    if (error instanceof Error) {
      if (error.name === 'ConfigNotFoundError') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to reorder rules',
    });
  }
}

/**
 * PATCH /api/config/configs/:configId/rules/:ruleId/toggle
 * Toggle rule enabled/disabled status
 */
export async function toggleRule(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId, ruleId } = req.params;

    if (!ruleId) {
      res.status(400).json({
        success: false,
        error: 'ruleId is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    // Get current rule to toggle enabled status
    const config = await configService.getConfig(configId);
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Config not found',
      });
      return;
    }

    const rule = config.rules?.find((r) => r.id === ruleId);
    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
      return;
    }

    // Toggle enabled status
    const updated = await configService.updateRule(
      ruleId,
      {
        enabled: !rule.enabled,
      },
      userId
    );

    logger.info('Rule toggled', {
      ruleId,
      configId,
      newEnabledStatus: !rule.enabled,
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        configId: updated.configId,
        priority: updated.priority,
        overrideValue: updated.overrideValue,
        enabled: updated.enabled,
        platformConditions: Array.isArray(updated.platformConditions) ? updated.platformConditions : (updated.platformConditions ? [updated.platformConditions] : null),
        countryConditions: Array.isArray(updated.countryConditions) ? updated.countryConditions : (updated.countryConditions ? [updated.countryConditions] : null),
        segmentConditions: Array.isArray(updated.segmentConditions) ? updated.segmentConditions : (updated.segmentConditions ? [updated.segmentConditions] : null),
        activeBetweenStart: updated.activeBetweenStart?.toISOString() || null,
        activeBetweenEnd: updated.activeBetweenEnd?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to toggle rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle rule',
    });
  }
}

