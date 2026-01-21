/**
 * Remote Config Routes
 * Admin and public endpoints for config management
 * Phase 3: User Story 1 - Config CRUD operations
 * Phase 6: User Story 4 - Rule Overwrites
 */

import { Router, Request, Response } from 'express';
import * as configController from '../controllers/configController';
import * as publicConfigController from '../controllers/publicConfigController';
import * as ruleController from '../controllers/ruleController';
import { validateConfigMiddleware } from '../middleware/validateConfig';
import { validateRuleMiddleware } from '../middleware/validateRule';
import { authenticateEither } from '../middleware/authenticateEither';
import logger from '../utils/logger';

const router = Router();

/**
 * Admin Routes - Require authentication
 * /api/admin/configs/*
 */

/**
 * POST /api/admin/configs
 * Create a new config (T033, T035)
 */
router.post(
  '/admin/configs',
  authenticateEither,
  validateConfigMiddleware,
  async (req: Request, res: Response) => {
    try {
      await configController.createConfig(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/configs:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/admin/configs/:gameId
 * List all configs for a game (T038)
 */
router.get(
  '/admin/configs/:gameId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await configController.listConfigs(req, res);
    } catch (error) {
      logger.error('Error in GET /api/admin/configs/:gameId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/admin/configs/:gameId/:configId
 * Get a single config
 */
router.get(
  '/admin/configs/:gameId/:configId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await configController.getConfig(req, res);
    } catch (error) {
      logger.error('Error in GET /api/admin/configs/:gameId/:configId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/admin/configs/:configId
 * Update a config (T036)
 */
router.put(
  '/admin/configs/:configId',
  authenticateEither,
  validateConfigMiddleware,
  async (req: Request, res: Response) => {
    try {
      await configController.updateConfig(req, res);
    } catch (error) {
      logger.error('Error in PUT /api/admin/configs/:configId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/admin/configs/:configId
 * Delete a config (T037)
 */
router.delete(
  '/admin/configs/:configId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await configController.deleteConfig(req, res);
    } catch (error) {
      logger.error('Error in DELETE /api/admin/configs/:configId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * Rule Endpoints - Require authentication
 * /api/admin/configs/:configId/rules/*
 */

/**
 * POST /api/admin/configs/:configId/rules
 * Create a new rule for a config (T092)
 */
router.post(
  '/admin/configs/:configId/rules',
  authenticateEither,
  validateRuleMiddleware,
  async (req: Request, res: Response) => {
    try {
      await ruleController.createRule(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/configs/:configId/rules:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/admin/configs/:configId/rules
 * List all rules for a config
 */
router.get(
  '/admin/configs/:configId/rules',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.listRules(req, res);
    } catch (error) {
      logger.error('Error in GET /api/admin/configs/:configId/rules:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * PUT /api/admin/configs/:configId/rules/:ruleId
 * Update a rule (T093)
 */
router.put(
  '/admin/configs/:configId/rules/:ruleId',
  authenticateEither,
  validateRuleMiddleware,
  async (req: Request, res: Response) => {
    try {
      await ruleController.updateRule(req, res);
    } catch (error) {
      logger.error('Error in PUT /api/admin/configs/:configId/rules/:ruleId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * DELETE /api/admin/configs/:configId/rules/:ruleId
 * Delete a rule (T094)
 */
router.delete(
  '/admin/configs/:configId/rules/:ruleId',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.deleteRule(req, res);
    } catch (error) {
      logger.error('Error in DELETE /api/admin/configs/:configId/rules/:ruleId:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/admin/configs/:configId/rules/reorder
 * Reorder rules for a config
 */
router.post(
  '/admin/configs/:configId/rules/reorder',
  authenticateEither,
  async (req: Request, res: Response) => {
    try {
      await ruleController.reorderRules(req, res);
    } catch (error) {
      logger.error('Error in POST /api/admin/configs/:configId/rules/reorder:', error);
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

export default router;

