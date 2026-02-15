import { Request, Response } from 'express';
import logger from '../utils/logger';
import * as gameConfigService from '../services/gameConfig/service';

/**
 * Public Game Config endpoints (Unity client style):
 * - GET version.json
 * - GET configs.json
 *
 * Note: envName is the Unity channel string (e.g. live_3.1.0).
 */

export async function getVersion(req: Request, res: Response): Promise<void> {
  try {
    const gameId = (req.query.gameId as string) || '';
    const env = (req.query.env as string) || '';
    if (!gameId || !env) {
      res.status(400).json({ success: false, error: 'gameId and env are required' });
      return;
    }

    const v = await gameConfigService.getPublicVersion({ gameId, envName: env });
    if (!v) {
      res.status(404).json({ success: false, error: 'Channel not found' });
      return;
    }

    res.status(200).json(v);
  } catch (error) {
    logger.error('Failed to get game config version:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getConfigs(req: Request, res: Response): Promise<void> {
  try {
    const gameId = (req.query.gameId as string) || '';
    const env = (req.query.env as string) || '';
    if (!gameId || !env) {
      res.status(400).json({ success: false, error: 'gameId and env are required' });
      return;
    }

    const out = await gameConfigService.getPublicConfigs({ gameId, envName: env });
    if (!out) {
      res.status(404).json({ success: false, error: 'Channel not found' });
      return;
    }
    if (!out.configs) {
      res.status(404).json({ success: false, error: 'No release published for this channel', version: out.version });
      return;
    }

    res.status(200).json(out.configs);
  } catch (error) {
    logger.error('Failed to get game config configs:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

