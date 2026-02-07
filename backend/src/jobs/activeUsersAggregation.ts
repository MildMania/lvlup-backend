import cron from 'node-cron';
import activeUsersAggregationService from '../services/ActiveUsersAggregationService';
import logger from '../utils/logger';

export function startActiveUsersAggregationJob(): void {
  logger.info('Initializing active users aggregation cron job...');

  // Daily rollup for yesterday at 2:30 AM UTC
  cron.schedule('30 2 * * *', async () => {
    try {
      logger.info('Starting daily active users aggregation...');
      const games = await activeUsersAggregationService.getGamesWithEvents();

      if (games.length === 0) {
        logger.info('No games with events to aggregate active users');
        return;
      }

      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      let success = 0;
      let errors = 0;

      for (const gameId of games) {
        try {
          await activeUsersAggregationService.aggregateDailyActiveUsers(gameId, yesterday);
          success++;
        } catch (error) {
          logger.error(`Active users aggregation failed for game ${gameId}:`, error);
          errors++;
        }
      }

      logger.info(`Daily active users aggregation complete: ${success} succeeded, ${errors} failed`);
    } catch (error) {
      logger.error('Error in active users daily aggregation job:', error);
    }
  });

  logger.info('Active users aggregation cron job started (runs daily at 02:30 UTC)');
}

export function startActiveUsersHourlyTodayJob(): void {
  logger.info('Initializing hourly active users aggregation for today...');

  // Hourly rollup for today at minute 10
  cron.schedule('10 * * * *', async () => {
    try {
      logger.info('Starting hourly active users aggregation for today...');
      const games = await activeUsersAggregationService.getGamesWithEvents();

      if (games.length === 0) {
        logger.info('No games with events to aggregate active users for today');
        return;
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      let success = 0;
      let errors = 0;

      for (const gameId of games) {
        try {
          await activeUsersAggregationService.aggregateDailyActiveUsers(gameId, today);
          success++;
        } catch (error) {
          logger.error(`Active users hourly aggregation failed for game ${gameId}:`, error);
          errors++;
        }
      }

      logger.info(`Hourly active users aggregation complete: ${success} succeeded, ${errors} failed`);
    } catch (error) {
      logger.error('Error in active users hourly aggregation job:', error);
    }
  });

  logger.info('Active users hourly aggregation job started (runs hourly at :10 UTC)');
}
