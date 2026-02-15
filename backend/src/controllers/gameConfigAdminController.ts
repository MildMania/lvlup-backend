import { Request, Response } from 'express';
import logger from '../utils/logger';
import {
  CreateChannelRequest,
  CreateSchemaRevisionRequest,
  DeployRequest,
  FreezeSectionRequest,
  OverwriteSchemaRevisionRequest,
  ResetChannelRequest,
  RollbackRequest,
  UpdateBundleDraftRequest,
  UpdateSectionDraftRequest,
} from '../types/gameConfig.types';
import * as gameConfigService from '../services/gameConfig/service';

function actorFromReq(req: Request): string {
  return (req as any).user?.id || (req as any).gameId || 'system';
}

function handleError(res: Response, error: any) {
  const issues = error?.issues;
  if (issues) {
    res.status(400).json({ success: false, error: error.message || 'Validation failed', issues });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}

export async function createSchemaRevision(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as CreateSchemaRevisionRequest;
    const actor = actorFromReq(req);
    const rev = await gameConfigService.createSchemaRevision(input, actor);
    res.status(201).json({ success: true, data: rev });
  } catch (error) {
    logger.error('Failed to create schema revision:', error);
    handleError(res, error);
  }
}

export async function overwriteSchemaRevision(req: Request, res: Response): Promise<void> {
  try {
    const schemaRevisionId = req.params.schemaRevisionId as string;
    if (!schemaRevisionId) {
      res.status(400).json({ success: false, error: 'schemaRevisionId is required' });
      return;
    }
    const input = req.body as OverwriteSchemaRevisionRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.overwriteSchemaRevision(schemaRevisionId, input, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error: any) {
    // Special case: schema in use and not forcing destructive overwrite
    if (error && (error as any).code === 'SCHEMA_IN_USE') {
      res.status(409).json({
        success: false,
        error: error.message || 'Schema revision is in use',
        boundChannels: (error as any).boundChannels || [],
      });
      return;
    }
    logger.error('Failed to overwrite schema revision:', error);
    handleError(res, error);
  }
}

export async function deleteSchemaRevision(req: Request, res: Response): Promise<void> {
  try {
    const schemaRevisionId = req.params.schemaRevisionId as string;
    if (!schemaRevisionId) {
      res.status(400).json({ success: false, error: 'schemaRevisionId is required' });
      return;
    }
    const gameId = (req.query.gameId as string) || (req as any).gameId;
    if (!gameId) {
      res.status(400).json({ success: false, error: 'gameId is required' });
      return;
    }
    const forceDeleteChannels = String(req.query.forceDeleteChannels || '').toLowerCase() === 'true';
    const actor = actorFromReq(req);
    const out = await gameConfigService.deleteSchemaRevision(schemaRevisionId, { gameId, forceDeleteChannels }, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error: any) {
    if (error && (error as any).code === 'SCHEMA_IN_USE') {
      res.status(409).json({
        success: false,
        error: error.message || 'Schema revision is in use',
        boundChannels: (error as any).boundChannels || [],
      });
      return;
    }
    logger.error('Failed to delete schema revision:', error);
    handleError(res, error);
  }
}

export async function createChannel(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as CreateChannelRequest;
    const actor = actorFromReq(req);
    const channel = await gameConfigService.createChannel(input, actor);
    res.status(201).json({ success: true, data: channel });
  } catch (error) {
    logger.error('Failed to create channel:', error);
    handleError(res, error);
  }
}

export async function resetChannel(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }
    const input = (req.body || {}) as ResetChannelRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.resetDevelopmentChannel(channelId, input, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to reset channel:', error);
    handleError(res, error);
  }
}

export async function deleteChannel(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }
    const actor = actorFromReq(req);
    const out = await gameConfigService.deleteDevelopmentChannel(channelId, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to delete channel:', error);
    handleError(res, error);
  }
}

export async function pullFromStaging(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }
    const actor = actorFromReq(req);
    const out = await gameConfigService.pullFromStagingToDevelopmentChannel(channelId, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to pull from staging:', error);
    handleError(res, error);
  }
}

export async function upsertSectionDraft(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const templateName = req.params.templateName as string;
    if (!channelId || !templateName) {
      res.status(400).json({ success: false, error: 'channelId and templateName are required' });
      return;
    }
    const input = req.body as UpdateSectionDraftRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.upsertSectionDraft(channelId, templateName, input, actor);
    res.status(200).json({ success: true, data: out.draft, issues: out.issues });
  } catch (error) {
    logger.error('Failed to upsert section draft:', error);
    handleError(res, error);
  }
}

export async function freezeSection(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const templateName = req.params.templateName as string;
    if (!channelId || !templateName) {
      res.status(400).json({ success: false, error: 'channelId and templateName are required' });
      return;
    }
    const input = (req.body || {}) as FreezeSectionRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.freezeSectionVersion(channelId, templateName, input, actor);
    res.status(201).json({ success: true, data: out.version, issues: out.issues });
  } catch (error) {
    logger.error('Failed to freeze section:', error);
    handleError(res, error);
  }
}

export async function updateBundleDraft(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }
    const input = req.body as UpdateBundleDraftRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.updateBundleDraft(channelId, input, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to update bundle draft:', error);
    handleError(res, error);
  }
}

export async function deploy(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as DeployRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.deployChannelBundle(input, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to deploy bundle:', error);
    handleError(res, error);
  }
}

export async function rollback(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as RollbackRequest;
    const actor = actorFromReq(req);
    const out = await gameConfigService.rollbackChannel(input, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to rollback bundle:', error);
    handleError(res, error);
  }
}

export async function listSchemaRevisions(req: Request, res: Response): Promise<void> {
  try {
    const gameId = (req.query.gameId as string) || (req as any).gameId;
    if (!gameId) {
      res.status(400).json({ success: false, error: 'gameId is required' });
      return;
    }
    const data = await gameConfigService.listSchemaRevisions(gameId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to list schema revisions:', error);
    handleError(res, error);
  }
}

export async function getSchemaRevision(req: Request, res: Response): Promise<void> {
  try {
    const schemaRevisionId = req.params.schemaRevisionId as string;
    if (!schemaRevisionId) {
      res.status(400).json({ success: false, error: 'schemaRevisionId is required' });
      return;
    }
    const data = await gameConfigService.getSchemaRevision(schemaRevisionId);
    if (!data) {
      res.status(404).json({ success: false, error: 'Schema revision not found' });
      return;
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to get schema revision:', error);
    handleError(res, error);
  }
}

export async function listChannels(req: Request, res: Response): Promise<void> {
  try {
    const gameId = (req.query.gameId as string) || (req as any).gameId;
    const toolEnvironment = req.query.toolEnvironment as any;
    if (!gameId) {
      res.status(400).json({ success: false, error: 'gameId is required' });
      return;
    }
    const data = await gameConfigService.listChannels(gameId, toolEnvironment);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to list channels:', error);
    handleError(res, error);
  }
}

export async function listSectionVersions(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const templateName = req.params.templateName as string;
    if (!channelId || !templateName) {
      res.status(400).json({ success: false, error: 'channelId and templateName are required' });
      return;
    }
    const data = await gameConfigService.listSectionVersions(channelId, templateName);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to list section versions:', error);
    handleError(res, error);
  }
}

export async function deleteSectionVersion(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const templateName = req.params.templateName as string;
    const versionId = req.params.versionId as string;
    if (!channelId || !templateName || !versionId) {
      res.status(400).json({ success: false, error: 'channelId, templateName and versionId are required' });
      return;
    }
    const actor = actorFromReq(req);
    const out = await gameConfigService.deleteSectionVersion(channelId, templateName, versionId, actor);
    res.status(200).json({ success: true, data: out });
  } catch (error) {
    logger.error('Failed to delete section version:', error);
    handleError(res, error);
  }
}

export async function listReleases(req: Request, res: Response): Promise<void> {
  try {
    const gameId = (req.query.gameId as string) || (req as any).gameId;
    const toolEnvironment = req.query.toolEnvironment as any;
    const env = req.query.env as any;
    if (!gameId || !toolEnvironment || !env) {
      res.status(400).json({ success: false, error: 'gameId, toolEnvironment, env are required' });
      return;
    }
    const data = await gameConfigService.listReleases(gameId, toolEnvironment, env);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to list releases:', error);
    handleError(res, error);
  }
}

export async function getBundleDraft(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }
    const data = await gameConfigService.getBundleDraft(channelId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to get bundle draft:', error);
    handleError(res, error);
  }
}

export async function getSectionDraft(req: Request, res: Response): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const templateName = req.params.templateName as string;
    if (!channelId || !templateName) {
      res.status(400).json({ success: false, error: 'channelId and templateName are required' });
      return;
    }
    const data = await gameConfigService.getSectionDraft(channelId, templateName);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to get section draft:', error);
    handleError(res, error);
  }
}
