/**
 * Game Config Routes
 * Spreadsheet-style versioned config bundles.
 *
 * Public:
 * - GET /api/game-config/version?gameId&env
 * - GET /api/game-config/configs?gameId&env
 *
 * Admin:
 * - POST /api/game-config/admin/schema-revisions
 * - POST /api/game-config/admin/channels
 * - PUT  /api/game-config/admin/channels/:channelId/sections/:templateName/draft
 * - POST /api/game-config/admin/channels/:channelId/sections/:templateName/freeze
 * - PUT  /api/game-config/admin/channels/:channelId/bundle-draft
 * - POST /api/game-config/admin/deploy
 * - POST /api/game-config/admin/rollback
 */

import { Router, Request, Response } from 'express';
import { authenticateEither } from '../middleware/authenticateEither';
import logger from '../utils/logger';
import * as admin from '../controllers/gameConfigAdminController';
import * as publicController from '../controllers/gameConfigPublicController';

const router = Router();

// Public endpoints (Unity clients)
router.get('/version', (req: Request, res: Response) => publicController.getVersion(req, res));
router.get('/configs', (req: Request, res: Response) => publicController.getConfigs(req, res));

// Admin endpoints
router.get('/admin/schema-revisions', authenticateEither, async (req, res) => {
  try {
    await admin.listSchemaRevisions(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/schema-revisions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/schema-revisions/:schemaRevisionId', authenticateEither, async (req, res) => {
  try {
    await admin.getSchemaRevision(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/schema-revisions/:id:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/schema-revisions', authenticateEither, async (req, res) => {
  try {
    await admin.createSchemaRevision(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/schema-revisions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/admin/schema-revisions/:schemaRevisionId', authenticateEither, async (req, res) => {
  try {
    await admin.overwriteSchemaRevision(req, res);
  } catch (error) {
    logger.error('Error in PUT /api/game-config/admin/schema-revisions/:schemaRevisionId:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/admin/schema-revisions/:schemaRevisionId', authenticateEither, async (req, res) => {
  try {
    await admin.deleteSchemaRevision(req, res);
  } catch (error) {
    logger.error('Error in DELETE /api/game-config/admin/schema-revisions/:schemaRevisionId:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/channels', authenticateEither, async (req, res) => {
  try {
    await admin.listChannels(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/channels:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/channels', authenticateEither, async (req, res) => {
  try {
    await admin.createChannel(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/channels:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/channels/:channelId/reset', authenticateEither, async (req, res) => {
  try {
    await admin.resetChannel(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/channels/:channelId/reset:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/admin/channels/:channelId', authenticateEither, async (req, res) => {
  try {
    await admin.deleteChannel(req, res);
  } catch (error) {
    logger.error('Error in DELETE /api/game-config/admin/channels/:channelId:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/channels/:channelId/pull-from-staging', authenticateEither, async (req, res) => {
  try {
    await admin.pullFromStaging(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/channels/:channelId/pull-from-staging:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/channels/:channelId/sections/:templateName/versions', authenticateEither, async (req, res) => {
  try {
    await admin.listSectionVersions(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/.../versions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/admin/channels/:channelId/sections/:templateName/versions/:versionId', authenticateEither, async (req, res) => {
  try {
    await admin.deleteSectionVersion(req, res);
  } catch (error) {
    logger.error('Error in DELETE /api/game-config/admin/.../versions/:versionId:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/admin/channels/:channelId/sections/:templateName/draft', authenticateEither, async (req, res) => {
  try {
    await admin.upsertSectionDraft(req, res);
  } catch (error) {
    logger.error('Error in PUT /api/game-config/admin/.../draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/channels/:channelId/sections/:templateName/draft', authenticateEither, async (req, res) => {
  try {
    await admin.getSectionDraft(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/.../draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/channels/:channelId/sections/:templateName/freeze', authenticateEither, async (req, res) => {
  try {
    await admin.freezeSection(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/.../freeze:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/admin/channels/:channelId/bundle-draft', authenticateEither, async (req, res) => {
  try {
    await admin.updateBundleDraft(req, res);
  } catch (error) {
    logger.error('Error in PUT /api/game-config/admin/.../bundle-draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/channels/:channelId/bundle-draft', authenticateEither, async (req, res) => {
  try {
    await admin.getBundleDraft(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/.../bundle-draft:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/releases', authenticateEither, async (req, res) => {
  try {
    await admin.listReleases(req, res);
  } catch (error) {
    logger.error('Error in GET /api/game-config/admin/releases:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/deploy', authenticateEither, async (req, res) => {
  try {
    await admin.deploy(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/deploy:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/admin/rollback', authenticateEither, async (req, res) => {
  try {
    await admin.rollback(req, res);
  } catch (error) {
    logger.error('Error in POST /api/game-config/admin/rollback:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
