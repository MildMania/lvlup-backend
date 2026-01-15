import { Router } from 'express';
import { AIAnalyticsController } from '../controllers/AIAnalyticsController';
import { authenticateEither } from '../middleware/authenticateEither';

const router = Router();
const aiAnalyticsController = new AIAnalyticsController();

// Apply authentication to all routes
router.use(authenticateEither);

// AI Analytics query processing
router.post('/query', aiAnalyticsController.processQuery);

// Helper endpoints
router.get('/examples', aiAnalyticsController.getExampleQueries);
router.get('/health', aiAnalyticsController.healthCheck);

export default router;