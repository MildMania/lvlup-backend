/**
 * Remote Config Routes
 * Admin and public endpoints for config management
 * Phase 3: User Story 1 - Config CRUD operations
 * Phase 6: User Story 4 - Rule Overwrites
 */

import { Router, Request, Response } from 'express';
import * as configController from '../controllers/ConfigController';
import * as publicConfigController from '../controllers/PublicConfigController';
import * as ruleController from '../controllers/RuleController';
import * as draftController from '../controllers/DraftController';
import { validateConfigMiddleware } from '../middleware/validateConfig';
import { validateRuleMiddleware } from '../middleware/validateRule';
import { authenticateEither } from '../middleware/authenticateEither';
import logger from '../utils/logger';

const router = Router();

/**
 * Admin Routes - Require authentication
 * /api/config/configs/*
 */

/**
 * POST /api/config/configs
 * Create a new config (T033, T035)
 */
router.post(
  '/configs',
  authenticateEither,
  validateConfigMiddleware,
  async (req: Request, res: Response) => {
    try {
      await configController.createConfig(req, res);
    } catch (error) {
      logger.error('Error in POST /api/config/configs:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * Rule Endpoints - Require authentication
 * /api/config/configs/:configId/rules/*
 * IMPORTANT: These routes must come BEFORE the /configs/:gameId route
 * to prevent Express from matching the more general pattern first
 */

/**
 * POST /api/config/configs/:configId/rules/reorder
 * Reorder rules for a config
 */
router.post(
  '/configs/:configId/rules/reorder',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.reorderRules(req, res);
    } catch (error) {
      logger.error('Error in POST /api/config/configs/:configId/rules/reorder:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/config/configs/:configId/rules
 * Create a new rule for a config (T092)
 */
router.post(
  '/configs/:configId/rules',
  authenticateEither,
  validateRuleMiddleware,
  async (req: Request, res: Response) => {
    try {
      await ruleController.createRule(req, res);
    } catch (error) {
      logger.error('Error in POST /api/config/configs/:configId/rules:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/config/configs/:configId/rules
 * List all rules for a config
 */
router.get(
  '/configs/:configId/rules',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.listRules(req, res);
    } catch (error) {
      logger.error('Error in GET /api/config/configs/:configId/rules:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/config/configs/:configId/rules/:ruleId
 * Update a rule (T093)
 */
router.put(
  '/configs/:configId/rules/:ruleId',
  authenticateEither,
  validateRuleMiddleware,
  async (req: Request, res: Response) => {
    try {
      await ruleController.updateRule(req, res);
    } catch (error) {
      logger.error('Error in PUT /api/config/configs/:configId/rules/:ruleId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/config/configs/:configId/rules/:ruleId
 * Delete a rule (T094)
 */
router.delete(
  '/configs/:configId/rules/:ruleId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.deleteRule(req, res);
    } catch (error) {
      logger.error('Error in DELETE /api/config/configs/:configId/rules/:ruleId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * History & Rollback Endpoints - Require authentication
 * /api/config/configs/:configId/rollback - POST
 * /api/config/configs/:gameId/history/:configKey - GET
 * IMPORTANT: These routes must come BEFORE /configs/:gameId to prevent route conflicts
 */

/**
 * POST /api/config/configs/:configId/rollback
 * Rollback a config to a previous version
 */
router.post(
  '/configs/:configId/rollback',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      // TODO: Implement rollback functionality
      // This should revert to a previous version from history
      res.status(501).json({
        success: false,
        error: 'Rollback functionality not yet implemented',
      });
    } catch (error) {
      logger.error('Error in POST /api/config/configs/:configId/rollback:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/config/configs/:gameId/history/:configKey
 * Get config history (version timeline)
 */
router.get(
  '/configs/:gameId/history/:configKey',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      // TODO: Implement history retrieval
      // This should return the version history for a specific config
      res.status(501).json({
        success: false,
        error: 'History functionality not yet implemented',
      });
    } catch (error) {
      logger.error('Error in GET /api/config/configs/:gameId/history/:configKey:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/config/configs/:gameId
 * List all configs for a game (T038)
 */
router.get(
  '/configs/:gameId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await configController.listConfigs(req, res);
    } catch (error) {
      logger.error('Error in GET /api/config/configs/:gameId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/config/configs/:configId
 * Update a config (T036)
 */
router.put(
  '/configs/:configId',
  authenticateEither,
  validateConfigMiddleware,
  async (req: Request, res: Response) => {
    try {
      await configController.updateConfig(req, res);
    } catch (error) {
      logger.error('Error in PUT /api/config/configs/:configId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/config/configs/:configId
 * Delete a config (T037)
 */
router.delete(
  '/configs/:configId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await configController.deleteConfig(req, res);
    } catch (error) {
      logger.error('Error in DELETE /api/config/configs/:configId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * Public Routes - No authentication required, but rate-limited
 * /api/configs/*
 */

/**
 * GET /api/configs/:gameId
 * Fetch configs with rule evaluation and caching (T039)
 * Query parameters: environment, platform, version, country, segment, debug
 */
router.get(
  '/configs/:gameId',
  async (req: Request, res: Response) => {
    try {
      await publicConfigController.fetchConfigs(req, res);
    } catch (error) {
      logger.error('Error in GET /api/configs/:gameId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/configs/:gameId/stats
 * Get config statistics for a game
 */
router.get(
  '/configs/:gameId/stats',
  async (req: Request, res: Response) => {
    try {
      await publicConfigController.getConfigStats(req, res);
    } catch (error) {
      logger.error('Error in GET /api/configs/:gameId/stats:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/configs/:gameId/validate
 * Validate what configs would be returned for given context
 */
router.post(
  '/configs/:gameId/validate',
  async (req: Request, res: Response) => {
    try {
      await publicConfigController.validateConfigs(req, res);
    } catch (error) {
      logger.error('Error in POST /api/configs/:gameId/validate:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * Draft Management Routes
 * /api/admin/drafts/*
 */

/**
 * POST /api/admin/drafts
 * Save config changes as a draft
 */
router.post(
  '/admin/drafts',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.saveAsDraft(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/drafts:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/admin/drafts
 * List pending drafts for a game
 */
router.get(
  '/admin/drafts',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.listPendingDrafts(req, res);
    } catch (error) {
      logger.error('Error in GET /api/admin/drafts:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/admin/drafts/:draftId
 * Get draft details
 */
router.get(
  '/admin/drafts/:draftId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.getDraftDetails(req, res);
    } catch (error) {
      logger.error('Error in GET /api/admin/drafts/:draftId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/admin/drafts/:draftId/deploy
 * Deploy/publish a draft
 */
router.post(
  '/admin/drafts/:draftId/deploy',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.deployDraft(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/drafts/:draftId/deploy:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/admin/drafts/:draftId/reject
 * Reject a draft
 */
router.post(
  '/admin/drafts/:draftId/reject',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.rejectDraft(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/drafts/:draftId/reject:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/admin/drafts/deploy-all
 * Deploy multiple drafts at once
 */
router.post(
  '/admin/drafts/deploy-all',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.deployMultipleDrafts(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/drafts/deploy-all:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/admin/drafts/:draftId
 * Delete a draft
 */
router.delete(
  '/admin/drafts/:draftId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await draftController.deleteDraft(req, res);
    } catch (error) {
      logger.error('Error in DELETE /api/admin/drafts/:draftId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export default router;

