/**
 * Admin Config Controller
 * Handles config CRUD operations for authenticated admins
 * Phase 3: User Story 1 - Basic config CRUD
 */

import { Request, Response } from 'express';
import * as configService from '../services/ConfigService';
import {
  CreateConfigRequest,
  CreateConfigResponse,
  UpdateConfigRequest,
  UpdateConfigResponse,
  ListConfigsResponse,
  DeleteConfigResponse,
  CreateConfigResponse as ConfigResponse,
} from '../types/api';
import { RemoteConfig } from '../types/config.types';
import logger from '../utils/logger';

/**
 * POST /api/admin/configs
 * Create a new remote config
 */
export async function createConfig(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { gameId, key, value, dataType, environment, enabled, description } = req.body;

    // Validate required fields
    if (!gameId || !key || value === undefined || !dataType) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: gameId, key, value, dataType',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    // Create config
    const config = await configService.createConfig(
      {
        gameId,
        key,
        value,
        dataType,
        environment: environment || 'production',
        enabled: enabled !== false,
        description,
      },
      userId
    );

    logger.info('Config created', {
      configId: config.id,
      gameId,
      key,
      userId,
    });

    res.status(201).json({
      success: true,
      data: {
        id: config.id,
        gameId: config.gameId,
        key: config.key,
        value: config.value,
        dataType: config.dataType,
        environment: config.environment,
        enabled: config.enabled,
        description: config.description,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    } as CreateConfigResponse);
  } catch (error) {
    logger.error('Failed to create config:', error);

    if (error instanceof Error) {
      if (error.name === 'DuplicateConfigKeyError') {
        res.status(409).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.name === 'ConfigValueTooLargeError') {
        res.status(413).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create config',
    });
  }
}

/**
 * GET /api/admin/configs/:gameId
 * List all configs for a game
 */
export async function listConfigs(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { gameId } = req.params;
    const { environment } = req.query;

    if (!gameId) {
      res.status(400).json({
        success: false,
        error: 'gameId is required',
      });
      return;
    }

    // Fetch configs
    const configs = await configService.getConfigs(
      gameId,
      (environment as string) || 'production'
    );

    logger.info('Configs listed', {
      gameId,
      count: configs.length,
      environment,
    });

    res.status(200).json({
      success: true,
      data: {
        configs: configs.map((config) => ({
          id: config.id,
          gameId: config.gameId,
          key: config.key,
          value: config.value,
          dataType: config.dataType,
          environment: config.environment,
          enabled: config.enabled,
          description: config.description,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
          rulesCount: config.rules?.length || 0,
        })),
        total: configs.length,
      },
    } as ListConfigsResponse);
  } catch (error) {
    logger.error('Failed to list configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list configs',
    });
  }
}

/**
 * GET /api/admin/configs/:gameId/:configId
 * Get a single config by ID
 */
export async function getConfig(
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

    const config = await configService.getConfig(configId);

    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Config not found',
      });
      return;
    }

    logger.info('Config retrieved', { configId });

    res.status(200).json({
      success: true,
      data: {
        id: config.id,
        gameId: config.gameId,
        key: config.key,
        value: config.value,
        dataType: config.dataType,
        environment: config.environment,
        enabled: config.enabled,
        description: config.description,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        rules: config.rules?.map((rule) => ({
          id: rule.id,
          priority: rule.priority,
          enabled: rule.enabled,
        })) || [],
      },
    });
  } catch (error) {
    logger.error('Failed to get config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get config',
    });
  }
}

/**
 * PUT /api/admin/configs/:configId
 * Update a config
 */
export async function updateConfig(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { configId } = req.params;
    const { value, enabled, description } = req.body;

    if (!configId) {
      res.status(400).json({
        success: false,
        error: 'configId is required',
      });
      return;
    }

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    // Update config
    const updated = await configService.updateConfig(
      configId,
      {
        value,
        enabled,
        description,
      },
      userId
    );

    logger.info('Config updated', {
      configId,
      userId,
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        gameId: updated.gameId,
        key: updated.key,
        value: updated.value,
        dataType: updated.dataType,
        environment: updated.environment,
        enabled: updated.enabled,
        description: updated.description,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    } as UpdateConfigResponse);
  } catch (error) {
    logger.error('Failed to update config:', error);

    if (error instanceof Error) {
      if (error.name === 'ConfigNotFoundError') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }
      if (error.name === 'ConfigValueTooLargeError') {
        res.status(413).json({
          success: false,
          error: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update config',
    });
  }
}

/**
 * DELETE /api/admin/configs/:configId
 * Delete a config
 */
export async function deleteConfig(
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

    // Get user ID from auth context
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    // Delete config
    await configService.deleteConfig(configId, userId);

    logger.info('Config deleted', {
      configId,
      userId,
    });

    res.status(200).json({
      success: true,
      message: 'Config deleted successfully',
    } as DeleteConfigResponse);
  } catch (error) {
    logger.error('Failed to delete config:', error);

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
      error: 'Failed to delete config',
    });
  }
}

