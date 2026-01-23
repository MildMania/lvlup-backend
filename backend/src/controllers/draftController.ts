import { Request, Response } from 'express';
import * as draftService from '../services/draftService';
import * as configService from '../services/configService';
import logger from '../utils/logger';

/**
 * Save changes as a draft (non-destructive)
 */
export async function saveAsDraft(req: Request, res: Response): Promise<void> {
  try {
    const { configId, gameId, key, value, dataType, environment, enabled, description, changes } =
      req.body;

    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    let actualConfigId = configId;

    // If configId is empty or not provided, this is a new config - create it first
    if (!configId || configId.trim() === '') {
      // Validate fields needed for new config creation
      if (!gameId) {
        res.status(400).json({
          success: false,
          error: 'Game context is missing. Please refresh the page and try again.',
        });
        return;
      }

      if (!key || value === undefined || !dataType) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: key, value, and dataType are required',
        });
        return;
      }

      try {
        // Create the new config
        const newConfig = await configService.createConfig(
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

        actualConfigId = newConfig.id;
        logger.info('New config created for draft', { configId: actualConfigId, key, gameId });
      } catch (error: any) {
        logger.error('Error creating new config:', error);
        
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
        
        throw error;
      }
    } else {
      // Editing existing config - gameId should still be provided
      if (!gameId) {
        res.status(400).json({
          success: false,
          error: 'Game context is missing. Please refresh the page and try again.',
        });
        return;
      }
    }

    const draft = await draftService.createConfigDraft({
      configId: actualConfigId,
      gameId,
      key,
      value,
      dataType,
      environment,
      enabled,
      description,
      changes,
      createdBy: userId,
    });

    logger.info('Config draft saved', { draftId: draft.id, configId: actualConfigId });

    res.status(201).json({
      success: true,
      data: {
        id: draft.id,
        configId: draft.configId,
        key: draft.key,
        value: draft.value,
        dataType: draft.dataType,
        environment: draft.environment,
        enabled: draft.enabled,
        description: draft.description,
        status: draft.status,
        createdAt: draft.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error saving config draft:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save draft',
    });
  }
}

/**
 * Get pending drafts for a game/environment
 */
export async function listPendingDrafts(req: Request, res: Response): Promise<void> {
  try {
    const { gameId, environment } = req.query;

    if (!gameId || typeof gameId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'gameId is required',
      });
      return;
    }

    const drafts = await draftService.getPendingDrafts(gameId, environment as string | undefined);

    logger.info('Pending drafts listed', { gameId, count: drafts.length });

    res.status(200).json({
      success: true,
      data: {
        drafts: drafts.map((draft) => ({
          id: draft.id,
          configId: draft.configId,
          key: draft.key,
          value: draft.value,
          dataType: draft.dataType,
          environment: draft.environment,
          enabled: draft.enabled,
          description: draft.description,
          status: draft.status,
          changes: draft.changes,
          createdAt: draft.createdAt.toISOString(),
          createdBy: draft.createdBy,
        })),
        count: drafts.length,
      },
    });
  } catch (error) {
    logger.error('Error listing pending drafts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list drafts',
    });
  }
}

/**
 * Deploy/publish a draft
 */
export async function deployDraft(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    if (!draftId) {
      res.status(400).json({
        success: false,
        error: 'draftId is required',
      });
      return;
    }

    const deployed = await draftService.deployDraft(draftId, userId);

    logger.info('Config draft deployed', { draftId, deployedBy: userId });

    res.status(200).json({
      success: true,
      data: {
        id: deployed.id,
        configId: deployed.configId,
        status: deployed.status,
        deployedAt: deployed.deployedAt?.toISOString(),
        deployedBy: deployed.deployedBy,
      },
    });
  } catch (error: any) {
    logger.error('Error deploying draft:', error);
    const statusCode = error.message?.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to deploy draft',
    });
  }
}

/**
 * Reject a draft
 */
export async function rejectDraft(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    if (!draftId) {
      res.status(400).json({
        success: false,
        error: 'draftId is required',
      });
      return;
    }

    const rejected = await draftService.rejectDraft(draftId, reason || '', userId);

    logger.info('Config draft rejected', { draftId, rejectedBy: userId });

    res.status(200).json({
      success: true,
      data: {
        id: rejected.id,
        configId: rejected.configId,
        status: rejected.status,
        rejectionReason: rejected.rejectionReason,
      },
    });
  } catch (error: any) {
    logger.error('Error rejecting draft:', error);
    const statusCode = error.message?.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to reject draft',
    });
  }
}

/**
 * Get draft details
 */
export async function getDraftDetails(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;

    if (!draftId) {
      res.status(400).json({
        success: false,
        error: 'draftId is required',
      });
      return;
    }

    const draft = await draftService.getDraftDetails(draftId);

    if (!draft) {
      res.status(404).json({
        success: false,
        error: 'Draft not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: draft,
    });
  } catch (error) {
    logger.error('Error getting draft details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get draft details',
    });
  }
}

/**
 * Delete a draft
 */
export async function deleteDraft(req: Request, res: Response): Promise<void> {
  try {
    const { draftId } = req.params;

    if (!draftId) {
      res.status(400).json({
        success: false,
        error: 'draftId is required',
      });
      return;
    }

    await draftService.deleteDraft(draftId);

    logger.info('Config draft deleted', { draftId });

    res.status(200).json({
      success: true,
      data: { message: 'Draft deleted successfully' },
    });
  } catch (error: any) {
    logger.error('Error deleting draft:', error);
    const statusCode = error.message?.includes('Cannot') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to delete draft',
    });
  }
}

/**
 * Deploy multiple drafts (bulk deploy)
 */
export async function deployMultipleDrafts(req: Request, res: Response): Promise<void> {
  try {
    const { draftIds } = req.body;
    const userId = (req as any).user?.id || (req as any).gameId || 'system';

    if (!draftIds || !Array.isArray(draftIds) || draftIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'draftIds array is required and must not be empty',
      });
      return;
    }

    const results = {
      successful: [] as string[],
      failed: [] as { draftId: string; reason: string }[],
    };

    for (const draftId of draftIds) {
      try {
        await draftService.deployDraft(draftId, userId);
        results.successful.push(draftId);
      } catch (error: any) {
        results.failed.push({
          draftId,
          reason: error.message || 'Unknown error',
        });
      }
    }

    logger.info('Bulk deployment completed', {
      successful: results.successful.length,
      failed: results.failed.length,
      deployedBy: userId,
    });

    res.status(200).json({
      success: results.failed.length === 0,
      data: results,
    });
  } catch (error: any) {
    logger.error('Error deploying multiple drafts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to deploy drafts',
    });
  }
}

