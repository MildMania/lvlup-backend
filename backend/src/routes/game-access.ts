import { Router } from 'express';
import gameAccessController from '../controllers/GameAccessController';
import { dashboardAuth, requireAdmin } from '../middleware/dashboardAuth';

const router = Router();

// All routes require authentication
router.use(dashboardAuth);

// Game access routes (admin only for granting/revoking)
router.post('/games/:gameId/access', requireAdmin, gameAccessController.grantAccess.bind(gameAccessController));
router.delete('/games/access/:accessId', requireAdmin, gameAccessController.revokeAccess.bind(gameAccessController));
router.put('/games/access/:accessId', requireAdmin, gameAccessController.updateAccessLevel.bind(gameAccessController));
router.get('/games/:gameId/access', gameAccessController.getGameAccess.bind(gameAccessController));

// User accessible games
router.get('/users/:userId/games', gameAccessController.getUserAccessibleGames.bind(gameAccessController));

export default router;

