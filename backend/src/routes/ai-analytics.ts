import { Router } from 'express';
import { AIAnalyticsController } from '../controllers/AIAnalyticsController';

const router = Router();
const aiAnalyticsController = new AIAnalyticsController();

// AI Analytics query processing
router.post('/query', aiAnalyticsController.processQuery);

// Helper endpoints
router.get('/health', aiAnalyticsController.checkHealth);
router.get('/examples', aiAnalyticsController.getExampleQueries);

export default router;