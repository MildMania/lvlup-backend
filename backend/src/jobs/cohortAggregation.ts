import cron from 'node-cron';
import cohortAggregationService, { COHORT_DAY_INDICES } from '../services/CohortAggregationService';
import logger from '../utils/logger';

export function startCohortAggregationJob(): void {
  logger.info('Initializing cohort aggregation cron job...');

  // Daily rollup for yesterday at 3:00 AM UTC
  cron.schedule('0 3 * * *', async () => {
    try {
      logger.info('Starting daily cohort aggregation...');
      const games = await cohortAggregationService.getGamesWithUsers();

      if (games.length === 0) {
        logger.info('No games with users to aggregate cohorts');
        return;
      }

      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      let success = 0;
      let errors = 0;
      for (const gameId of games) {
        try {
          await cohortAggregationService.aggregateForDate(gameId, yesterday, COHORT_DAY_INDICES);
          success++;
        } catch (error) {
          logger.error(`Cohort aggregation failed for game ${gameId}:`, error);
          errors++;
        }
      }

      logger.info(`Daily cohort aggregation complete: ${success} succeeded, ${errors} failed`);
    } catch (error) {
      logger.error('Error in daily cohort aggregation job:', error);
    }
  });

  logger.info('Cohort aggregation cron job started (runs daily at 03:00 UTC)');
}

export function startCohortHourlyTodayJob(): void {
  logger.info('Initializing hourly cohort aggregation for today...');

  // Hourly rollup for today at minute 15
  cron.schedule('15 * * * *', async () => {
    try {
      logger.info('Starting hourly cohort aggregation for today...');
      const games = await cohortAggregationService.getGamesWithUsers();

      if (games.length === 0) {
        logger.info('No games with users to aggregate cohorts for today');
        return;
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      let success = 0;
      let errors = 0;
      for (const gameId of games) {
        try {
          await cohortAggregationService.aggregateForDate(gameId, today, COHORT_DAY_INDICES);
          success++;
        } catch (error) {
          logger.error(`Cohort hourly aggregation failed for game ${gameId}:`, error);
          errors++;
        }
      }

      logger.info(`Hourly cohort aggregation complete: ${success} succeeded, ${errors} failed`);
    } catch (error) {
      logger.error('Error in hourly cohort aggregation job:', error);
    }
  });

  logger.info('Cohort hourly aggregation job started (runs hourly at :15 UTC)');
}
