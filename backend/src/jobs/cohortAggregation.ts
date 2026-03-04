import cron from 'node-cron';
import cohortAggregationService, { COHORT_DAY_INDICES } from '../services/CohortAggregationService';
import logger from '../utils/logger';
import { withJobAdvisoryLock } from './advisoryLock';
import { maybeThrottleAggregation } from '../utils/aggregationThrottle';

export function startCohortAggregationJob(): void {
  logger.info('Initializing cohort aggregation cron job...');

  // Daily rollup for yesterday at 3:00 AM UTC
  cron.schedule('0 3 * * *', async () => {
    await withJobAdvisoryLock('cohort-daily', async () => {
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
          } finally {
            await maybeThrottleAggregation(`cohort-daily-job:${gameId}`);
          }
        }

        logger.info(`Daily cohort aggregation complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('Error in daily cohort aggregation job:', error);
      }
    });
  });

  logger.info('Cohort aggregation cron job started (runs daily at 03:00 UTC)');
}

export function startCohortHourlyTodayJob(): void {
  logger.info('Initializing hourly cohort aggregation for today...');

  // Hourly rollup for today at minute 15
  cron.schedule('15 * * * *', async () => {
    await withJobAdvisoryLock('cohort-hourly-today', async () => {
      try {
        logger.info('Starting incremental hourly cohort retention update...');
        const games = await cohortAggregationService.getGamesWithUsers();

        if (games.length === 0) {
          logger.info('No games with users to aggregate cohorts for today');
          return;
        }

        const hourEnd = new Date();
        hourEnd.setUTCSeconds(0, 0);
        const hourStart = new Date(hourEnd);
        hourStart.setUTCHours(hourStart.getUTCHours() - 1);

        let success = 0;
        let errors = 0;
        for (const gameId of games) {
          try {
            await cohortAggregationService.aggregateHourlyRetentionUsersForToday(gameId, hourStart, hourEnd);
            success++;
          } catch (error) {
            logger.error(`Cohort hourly incremental update failed for game ${gameId}:`, error);
            errors++;
          } finally {
            await maybeThrottleAggregation(`cohort-hourly-job:${gameId}`);
          }
        }

        logger.info(`Hourly cohort incremental update complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('Error in hourly cohort incremental job:', error);
      }
    });
  });

  logger.info('Cohort hourly incremental job started (runs hourly at :15 UTC)');
}
