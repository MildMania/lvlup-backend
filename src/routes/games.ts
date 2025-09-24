import { Router } from 'express';
import { GameController } from '../controllers/GameController';
// For game management, we'll add admin authentication later

const router = Router();
const gameController = new GameController();

// Game management endpoints
router.post('/', gameController.createGame);
router.get('/', gameController.listGames);
router.get('/:id', gameController.getGame);
router.put('/:id/api-key', gameController.regenerateApiKey);
router.delete('/:id', gameController.deleteGame);

export default router;