import { Router } from 'express';
import { AIContextController } from '../controllers/AIContextController';

const router = Router();
const aiContextController = new AIContextController();

// Release management routes
router.post('/release', aiContextController.addRelease);
router.get('/releases', aiContextController.getReleases);
router.put('/release/:id', aiContextController.updateRelease);

// Business event management routes  
router.post('/business-event', aiContextController.addBusinessEvent);
router.get('/business-events', aiContextController.getBusinessEvents);
router.put('/business-event/:id', aiContextController.updateBusinessEvent);

// Context retrieval routes
router.get('/range', aiContextController.getContextForDateRange);
router.get('/summary', aiContextController.getContextSummary);

// AI query and insight management routes
router.post('/query', aiContextController.storeAIQuery);
router.post('/insight', aiContextController.storeInsight);
router.get('/insights', aiContextController.getRecentInsights);

export default router;