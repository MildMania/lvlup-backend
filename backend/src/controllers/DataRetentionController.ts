import { Response } from 'express';
import { DashboardAuthRequest } from '../middleware/dashboardAuth';
import { dataRetentionService } from '../services/DataRetentionService';
import logger from '../utils/logger';

export class DataRetentionController {
    /**
     * Get retention statistics - how many records are eligible for deletion
     */
    async getRetentionStats(req: DashboardAuthRequest, res: Response) {
        try {
            const stats = await dataRetentionService.getRetentionStats();
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('Error getting retention stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get retention statistics'
            });
        }
    }

    /**
     * Manually trigger cleanup for all tables
     */
    async triggerCleanup(req: DashboardAuthRequest, res: Response) {
        try {
            logger.info('Manual cleanup triggered by user:', req.dashboardUser?.email);
            
            // Run cleanup asynchronously
            dataRetentionService.runCleanup().catch(err => {
                logger.error('Error in manual cleanup:', err);
            });
            
            res.json({
                success: true,
                message: 'Cleanup triggered successfully. This will run in the background.'
            });
        } catch (error) {
            logger.error('Error triggering cleanup:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to trigger cleanup'
            });
        }
    }

    /**
     * Cleanup specific table
     */
    async cleanupTable(req: DashboardAuthRequest, res: Response) {
        try {
            const { table } = req.params;
            
            if (!table || !['events', 'crashLogs', 'sessions', 'aiQueries'].includes(table)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid table name. Must be: events, crashLogs, sessions, or aiQueries'
                });
            }
            
            logger.info(`Manual cleanup triggered for table ${table} by user:`, req.dashboardUser?.email);
            
            const deletedCount = await dataRetentionService.cleanupTable(table as any);
            
            res.json({
                success: true,
                message: `Cleanup completed for ${table}`,
                deletedCount
            });
        } catch (error) {
            logger.error('Error cleaning up table:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to cleanup table'
            });
        }
    }
}

export const dataRetentionController = new DataRetentionController();

