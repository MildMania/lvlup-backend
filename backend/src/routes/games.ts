import { Router } from 'express';
import { GameController } from '../controllers/GameController';
import { authenticateEither } from '../middleware/authenticateEither';

const router = Router();
const gameController = new GameController();


// Apply authentication to all game routes
router.use(authenticateEither);

// Game management endpoints
router.post('/', gameController.createGame);
router.get('/', gameController.listGames);
router.get('/:id', gameController.getGame);
router.put('/:id/api-key', gameController.regenerateApiKey);
router.delete('/:id', gameController.deleteGame);

export default router;