import cron from 'node-cron';
import activeUsersAggregationService from '../services/ActiveUsersAggregationService';
import logger from '../utils/logger';
import { withJobAdvisoryLock } from './advisoryLock';
import { maybeThrottleAggregation } from '../utils/aggregationThrottle';

export function startActiveUsersAggregationJob(): void {
  logger.info('[Postgres] Initializing active users aggregation cron job...');

  // Daily rollup for yesterday at 2:30 AM UTC
  cron.schedule('30 2 * * *', async () => {
    await withJobAdvisoryLock('active-users-daily', async () => {
      try {
        logger.info('[Postgres] Starting daily active users aggregation...');
        const games = await activeUsersAggregationService.getGamesWithEvents();

        if (games.length === 0) {
          logger.info('[Postgres] No games with events to aggregate active users');
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
            logger.error(`[Postgres] Active users aggregation failed for game ${gameId}:`, error);
            errors++;
          } finally {
            await maybeThrottleAggregation(`active-users-daily-job:${gameId}`);
          }
        }

        logger.info(`[Postgres] Daily active users aggregation complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('[Postgres] Error in active users daily aggregation job:', error);
      }
    });
  });

  logger.info('[Postgres] Active users aggregation cron job started (runs daily at 02:30 UTC)');
}

export function startActiveUsersHourlyTodayJob(): void {
  logger.info('[Postgres] Initializing hourly active users aggregation for today...');

  // Hourly rollup for today at minute 10
  cron.schedule('10 * * * *', async () => {
    await withJobAdvisoryLock('active-users-hourly-today', async () => {
      try {
        logger.info('[Postgres] Starting hourly active users aggregation for today...');
        const games = await activeUsersAggregationService.getGamesWithEvents();

        if (games.length === 0) {
          logger.info('[Postgres] No games with events to aggregate active users for today');
          return;
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        let success = 0;
        let errors = 0;

        for (const gameId of games) {
          try {
            await activeUsersAggregationService.aggregateDailyActiveUsers(gameId, today, { skipHll: true });
            success++;
          } catch (error) {
            logger.error(`[Postgres] Active users hourly aggregation failed for game ${gameId}:`, error);
            errors++;
          } finally {
            await maybeThrottleAggregation(`active-users-hourly-job:${gameId}`);
          }
        }

        logger.info(`[Postgres] Hourly active users aggregation complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('[Postgres] Error in active users hourly aggregation job:', error);
      }
    });
  });

  logger.info('[Postgres] Active users hourly aggregation job started (runs hourly at :10 UTC)');
}
