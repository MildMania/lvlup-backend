import { Router } from 'express';
import levelFunnelController from '../controllers/LevelFunnelController';

const router = Router();

/**
 * @route GET /api/analytics/level-funnel
 * @desc Get level funnel data with metrics
 * @query gameId, startDate, endDate, country, version, abTestId
 */
router.get('/', levelFunnelController.getLevelFunnel.bind(levelFunnelController));

/**
 * @route GET /api/analytics/level-funnel/custom-metrics
 * @desc Get available custom metrics for a game
 * @query gameId
 */
router.get('/custom-metrics', levelFunnelController.getCustomMetrics.bind(levelFunnelController));


/**
 * @route GET /api/analytics/level-funnel/:levelId
 * @desc Get specific level details
 * @params levelId
 * @query gameId, startDate, endDate, country, version
 */
router.get('/:levelId', levelFunnelController.getLevelDetails.bind(levelFunnelController));

export default router;

