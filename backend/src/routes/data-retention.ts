import { Router } from 'express';
import { dataRetentionController } from '../controllers/DataRetentionController';
import { dashboardAuth } from '../middleware/dashboardAuth';

const router = Router();

// All routes require dashboard authentication
router.use(dashboardAuth);

// Get retention statistics
router.get('/stats', (req, res) => dataRetentionController.getRetentionStats(req, res));

// Trigger manual cleanup for all tables
router.post('/cleanup', (req, res) => dataRetentionController.triggerCleanup(req, res));

// Cleanup specific table
router.post('/cleanup/:table', (req, res) => dataRetentionController.cleanupTable(req, res));

export default router;

