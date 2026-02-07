import cron from 'node-cron';
import fxRateService from '../services/FxRateService';
import logger from '../utils/logger';

export function startFxRatesSyncJob(): void {
  logger.info('Initializing FX rates sync cron job...');

  // Daily sync at 00:05 UTC
  cron.schedule('5 0 * * *', async () => {
    try {
      const count = await fxRateService.syncToday();
      logger.info(`FX rates sync complete: ${count} rates`);
    } catch (error) {
      logger.error('Error in FX rates sync job:', error);
    }
  });

  logger.info('FX rates sync cron job started (runs daily at 00:05 UTC)');
}
