/**
 * Admin Config Controller
 * Handles config CRUD operations for authenticated admins
 * Phase 3: User Story 1 - Basic config CRUD
 */

import { Request, Response } from 'express';
import * as configService from '../services/configService';
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

    // Enforce best-practice workflow: direct create allowed only in development
    const env = (environment || 'development').toLowerCase();
    if (env !== 'development') {
      res.status(403).json({
        success: false,
        error: 'Direct creation is only allowed in the development environment. Create changes in development and deploy to staging/publish to production via the drafts/deploy workflow.',
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
        environment: 'development',
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

    // Get the existing config to check environment
    const existingConfig = await configService.getConfig(configId);
    if (!existingConfig) {
      res.status(404).json({ success: false, error: 'Config not found' });
      return;
    }

    // Only allow direct updates in development (staging and production are read-only)
    const env = (existingConfig.environment || '').toLowerCase();
    if (env !== 'development') {
      res.status(403).json({
        success: false,
        error: 'Direct updates are only allowed in development. Changes flow: Development → Stash to Staging → Publish to Production.',
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

    // Get the existing config to check environment
    const existingConfig = await configService.getConfig(configId);
    if (!existingConfig) {
      res.status(404).json({ success: false, error: 'Config not found' });
      return;
    }

    // Only allow deletion in development environment
    if ((existingConfig.environment || '').toLowerCase() !== 'development') {
      res.status(403).json({
        success: false,
        error: 'Direct deletion is only allowed in the development environment. Configs in staging/production should be managed through the deployment workflow.',
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

/**
 * POST /api/admin/configs/:configId/revert
 * Revert a staging config back to development
 */
export async function revertConfig(req: Request, res: Response): Promise<void> {
  try {
    const { configId } = req.params;

    if (!configId) {
      res.status(400).json({ success: false, error: 'configId is required' });
      return;
    }

    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    const result = await (await import('../services/configService')).revertConfigToDevelopment(configId, userId);

    res.status(200).json({
      success: true,
      data: {
        id: result.id,
        gameId: result.gameId,
        key: result.key,
        environment: result.environment,
        createdAt: result.createdAt?.toISOString?.(),
      },
    });
  } catch (error: any) {
    logger.error('Failed to revert config:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to revert config' });
  }
}

/**
 * POST /api/config/admin/stash-to-staging
 * Stash configs from development to staging environment
 * Replaces ALL staging configs with development configs (complete replacement)
 * Also copies all rules attached to each config
 */
export async function stashToStaging(req: Request, res: Response): Promise<void> {
  try {
    const { gameId, configIds } = req.body;

    if (!gameId || !configIds || !Array.isArray(configIds)) {
      res.status(400).json({
        success: false,
        error: 'gameId and configIds array are required',
      });
      return;
    }

    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Stashing configs to staging (complete replacement with rules)', { gameId, configCount: configIds.length, userId });

    // STEP 1: Delete ALL existing staging configs for this game (rules will cascade delete)
    const existingStagingConfigs = await configService.getConfigs(gameId, 'staging');
    logger.info('Deleting existing staging configs', { count: existingStagingConfigs.length });
    
    await Promise.allSettled(
      existingStagingConfigs.map(async (config) => {
        try {
          await configService.deleteConfig(config.id, userId);
        } catch (error) {
          logger.warn(`Failed to delete staging config ${config.id}`, error);
        }
      })
    );

    // STEP 2: Copy all development configs to staging WITH their rules (sequentially to preserve order)
    const results = [];
    const snapshotConfigs = [];
    
    for (const configId of configIds) {
      try {
        const config = await configService.getConfig(configId);
        if (!config) {
          throw new Error(`Config ${configId} not found`);
        }

        // Only allow stashing from development
        if ((config.environment || '').toLowerCase() !== 'development') {
          throw new Error(`Config ${configId} is not in development environment`);
        }

        // Create new staging config
        const newStagingConfig = await configService.createConfig(
          {
            gameId: config.gameId,
            key: config.key,
            value: config.value,
            dataType: config.dataType,
            environment: 'staging',
            enabled: config.enabled,
            description: config.description,
          },
          userId
        );

        // Copy all rules from dev config to new staging config
        const copiedRules = [];
        if (config.rules && config.rules.length > 0) {
          logger.info(`Copying ${config.rules.length} rules for config ${config.key}`);
          
          for (const rule of config.rules) {
            try {
              const newRule = await configService.createRule(
                {
                  configId: newStagingConfig.id,
                  priority: rule.priority,
                  overrideValue: rule.overrideValue,
                  enabled: rule.enabled,
                  platformConditions: rule.platformConditions,
                  countryConditions: rule.countryConditions,
                  segmentConditions: rule.segmentConditions,
                  activeBetweenStart: rule.activeBetweenStart,
                  activeBetweenEnd: rule.activeBetweenEnd,
                },
                userId
              );
              copiedRules.push({
                id: newRule.id,
                priority: newRule.priority,
                overrideValue: newRule.overrideValue,
                enabled: newRule.enabled,
                platformConditions: newRule.platformConditions,
                countryConditions: newRule.countryConditions,
                segmentConditions: newRule.segmentConditions,
                activeBetweenStart: newRule.activeBetweenStart,
                activeBetweenEnd: newRule.activeBetweenEnd,
              });
            } catch (error) {
              logger.warn(`Failed to copy rule ${rule.id} for config ${config.key}`, error);
            }
          }
        }

        // Add to snapshot
        snapshotConfigs.push({
          id: newStagingConfig.id,
          key: newStagingConfig.key,
          value: newStagingConfig.value,
          dataType: newStagingConfig.dataType,
          enabled: newStagingConfig.enabled,
          description: newStagingConfig.description,
          rules: copiedRules,
        });

        results.push({ status: 'fulfilled', value: newStagingConfig });
      } catch (error: any) {
        logger.warn(`Failed to stash config ${configId}:`, error);
        results.push({ status: 'rejected', reason: error });
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const deleted = existingStagingConfigs.length;

    // STEP 3: Create deployment record
    try {
      const deploymentService = await import('../services/deploymentService');
      await deploymentService.createDeployment({
        gameId,
        environment: 'staging',
        deployedBy: userId,
        source: 'stash-from-dev',
        snapshot: { configs: snapshotConfigs },
      });
      logger.info('Deployment record created for staging');
    } catch (error) {
      logger.error('Failed to create deployment record:', error);
    }

    logger.info('Stash to staging complete (full replacement with rules + deployment)', { deleted, successful, failed });

    res.status(200).json({
      success: true,
      data: {
        deleted,
        successful,
        failed,
        total: configIds.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to stash to staging:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to stash to staging' });
  }
}

/**
 * POST /api/config/admin/publish-to-production
 * Publish configs from staging to production environment
 * Replaces ALL production configs with staging configs (complete replacement)
 * Also copies all rules attached to each config
 */
export async function publishToProduction(req: Request, res: Response): Promise<void> {
  try {
    const { gameId, configIds } = req.body;

    if (!gameId || !configIds || !Array.isArray(configIds)) {
      res.status(400).json({
        success: false,
        error: 'gameId and configIds array are required',
      });
      return;
    }

    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Publishing configs to production (complete replacement with rules)', { gameId, configCount: configIds.length, userId });

    // STEP 1: Delete ALL existing production configs for this game (rules will cascade delete)
    const existingProductionConfigs = await configService.getConfigs(gameId, 'production');
    logger.info('Deleting existing production configs', { count: existingProductionConfigs.length });
    
    await Promise.allSettled(
      existingProductionConfigs.map(async (config) => {
        try {
          await configService.deleteConfig(config.id, userId);
        } catch (error) {
          logger.warn(`Failed to delete production config ${config.id}`, error);
        }
      })
    );

    // STEP 2: Copy all staging configs to production WITH their rules (sequentially to preserve order)
    const results = [];
    const snapshotConfigs = [];
    
    for (const configId of configIds) {
      try {
        const config = await configService.getConfig(configId);
        if (!config) {
          throw new Error(`Config ${configId} not found`);
        }

        // Only allow publishing from staging
        if ((config.environment || '').toLowerCase() !== 'staging') {
          throw new Error(`Config ${configId} is not in staging environment`);
        }

        // Create new production config
        const newProductionConfig = await configService.createConfig(
          {
            gameId: config.gameId,
            key: config.key,
            value: config.value,
            dataType: config.dataType,
            environment: 'production',
            enabled: config.enabled,
            description: config.description,
          },
          userId
        );

        // Copy all rules from staging config to new production config
        const copiedRules = [];
        if (config.rules && config.rules.length > 0) {
          logger.info(`Copying ${config.rules.length} rules for config ${config.key}`);
          
          for (const rule of config.rules) {
            try {
              const newRule = await configService.createRule(
                {
                  configId: newProductionConfig.id,
                  priority: rule.priority,
                  overrideValue: rule.overrideValue,
                  enabled: rule.enabled,
                  platformConditions: rule.platformConditions,
                  countryConditions: rule.countryConditions,
                  segmentConditions: rule.segmentConditions,
                  activeBetweenStart: rule.activeBetweenStart,
                  activeBetweenEnd: rule.activeBetweenEnd,
                },
                userId
              );
              copiedRules.push({
                id: newRule.id,
                priority: newRule.priority,
                overrideValue: newRule.overrideValue,
                enabled: newRule.enabled,
                platformConditions: newRule.platformConditions,
                countryConditions: newRule.countryConditions,
                segmentConditions: newRule.segmentConditions,
                activeBetweenStart: newRule.activeBetweenStart,
                activeBetweenEnd: newRule.activeBetweenEnd,
              });
            } catch (error) {
              logger.warn(`Failed to copy rule ${rule.id} for config ${config.key}`, error);
            }
          }
        }

        // Add to snapshot
        snapshotConfigs.push({
          id: newProductionConfig.id,
          key: newProductionConfig.key,
          value: newProductionConfig.value,
          dataType: newProductionConfig.dataType,
          enabled: newProductionConfig.enabled,
          description: newProductionConfig.description,
          rules: copiedRules,
        });

        results.push({ status: 'fulfilled', value: newProductionConfig });
      } catch (error: any) {
        logger.warn(`Failed to publish config ${configId}:`, error);
        results.push({ status: 'rejected', reason: error });
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const deleted = existingProductionConfigs.length;

    // STEP 3: Create deployment record
    try {
      const deploymentService = await import('../services/deploymentService');
      await deploymentService.createDeployment({
        gameId,
        environment: 'production',
        deployedBy: userId,
        source: 'publish-from-staging',
        snapshot: { configs: snapshotConfigs },
      });
      logger.info('Deployment record created for production');
    } catch (error) {
      logger.error('Failed to create deployment record:', error);
    }

    logger.info('Publish to production complete (full replacement with rules + deployment)', { deleted, successful, failed });

    res.status(200).json({
      success: true,
      data: {
        deleted,
        successful,
        failed,
        total: configIds.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to publish to production:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to publish to production' });
  }
}

/**
 * POST /api/config/admin/pull-from-staging
 * Pull configs from staging back to development environment (two-way sync)
 * Replaces ALL development configs with staging configs (complete replacement)
 * Also copies all rules attached to each config
 */
export async function pullFromStaging(req: Request, res: Response): Promise<void> {
  try {
    const { gameId, configIds } = req.body;

    if (!gameId || !configIds || !Array.isArray(configIds)) {
      res.status(400).json({
        success: false,
        error: 'gameId and configIds array are required',
      });
      return;
    }

    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    logger.info('Pulling configs from staging to development (complete replacement with rules)', { gameId, configCount: configIds.length, userId });

    // STEP 1: Delete ALL existing development configs for this game (rules will cascade delete)
    const existingDevelopmentConfigs = await configService.getConfigs(gameId, 'development');
    logger.info('Deleting existing development configs', { count: existingDevelopmentConfigs.length });
    
    await Promise.allSettled(
      existingDevelopmentConfigs.map(async (config) => {
        try {
          await configService.deleteConfig(config.id, userId);
        } catch (error) {
          logger.warn(`Failed to delete development config ${config.id}`, error);
        }
      })
    );

    // STEP 2: Copy all staging configs to development WITH their rules (sequentially to preserve order)
    const results = [];
    for (const configId of configIds) {
      try {
        const config = await configService.getConfig(configId);
        if (!config) {
          throw new Error(`Config ${configId} not found`);
        }

        // Only allow pulling from staging
        if ((config.environment || '').toLowerCase() !== 'staging') {
          throw new Error(`Config ${configId} is not in staging environment`);
        }

        // Create new development config
        const newDevelopmentConfig = await configService.createConfig(
          {
            gameId: config.gameId,
            key: config.key,
            value: config.value,
            dataType: config.dataType,
            environment: 'development',
            enabled: config.enabled,
            description: config.description,
          },
          userId
        );

        // Copy all rules from staging config to new development config
        if (config.rules && config.rules.length > 0) {
          logger.info(`Copying ${config.rules.length} rules for config ${config.key}`);
          
          for (const rule of config.rules) {
            try {
              await configService.createRule(
                {
                  configId: newDevelopmentConfig.id,
                  priority: rule.priority,
                  overrideValue: rule.overrideValue,
                  enabled: rule.enabled,
                  platformConditions: rule.platformConditions,
                  countryConditions: rule.countryConditions,
                  segmentConditions: rule.segmentConditions,
                  activeBetweenStart: rule.activeBetweenStart,
                  activeBetweenEnd: rule.activeBetweenEnd,
                },
                userId
              );
            } catch (error) {
              logger.warn(`Failed to copy rule ${rule.id} for config ${config.key}`, error);
            }
          }
        }

        results.push({ status: 'fulfilled', value: newDevelopmentConfig });
      } catch (error: any) {
        logger.warn(`Failed to pull config ${configId}:`, error);
        results.push({ status: 'rejected', reason: error });
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const deleted = existingDevelopmentConfigs.length;

    logger.info('Pull from staging complete (full replacement with rules)', { deleted, successful, failed });

    res.status(200).json({
      success: true,
      data: {
        deleted,
        successful,
        failed,
        total: configIds.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to pull from staging:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to pull from staging' });
  }
}

