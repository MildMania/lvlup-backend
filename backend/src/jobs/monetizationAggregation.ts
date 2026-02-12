import cron from 'node-cron';
import monetizationAggregationService from '../services/MonetizationAggregationService';
import logger from '../utils/logger';
import { withJobAdvisoryLock } from './advisoryLock';

export function startMonetizationAggregationJob(): void {
  logger.info('Initializing monetization aggregation cron job...');

  // Daily rollup for yesterday at 03:30 UTC
  cron.schedule('30 3 * * *', async () => {
    await withJobAdvisoryLock('monetization-daily', async () => {
      try {
        logger.info('Starting daily monetization aggregation...');
        const games = await monetizationAggregationService.getGamesWithRevenue();

        if (games.length === 0) {
          logger.info('No games with revenue to aggregate');
          return;
        }

        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);

        for (const gameId of games) {
          await monetizationAggregationService.aggregateDaily(gameId, yesterday);
        }

        logger.info(`Daily monetization aggregation complete for ${games.length} games`);
      } catch (error) {
        logger.error('Error in daily monetization aggregation job:', error);
      }
    });
  });

  logger.info('Monetization aggregation cron job started (runs daily at 03:30 UTC)');
}

export function startMonetizationHourlyTodayJob(): void {
  logger.info('Initializing hourly monetization aggregation for today...');

  // Hourly rollup for today at minute 20
  cron.schedule('20 * * * *', async () => {
    await withJobAdvisoryLock('monetization-hourly-today', async () => {
      try {
        logger.info('Starting hourly monetization aggregation for today...');
        const games = await monetizationAggregationService.getGamesWithRevenue();

        if (games.length === 0) {
          logger.info('No games with revenue to aggregate for today');
          return;
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        for (const gameId of games) {
          await monetizationAggregationService.aggregateDaily(gameId, today);
        }

        logger.info(`Hourly monetization aggregation complete for ${games.length} games`);
      } catch (error) {
        logger.error('Error in hourly monetization aggregation job:', error);
      }
    });
  });

  logger.info('Monetization hourly aggregation job started (runs hourly at :20 UTC)');
}
