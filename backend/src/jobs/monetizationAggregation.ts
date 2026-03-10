import cron from 'node-cron';
import monetizationAggregationService from '../services/MonetizationAggregationService';
import logger from '../utils/logger';
import { withJobAdvisoryLock } from './advisoryLock';
import { maybeThrottleAggregation } from '../utils/aggregationThrottle';

export function startMonetizationAggregationJob(): void {
  logger.info('[Postgres] Initializing monetization aggregation cron job...');

  // Daily rollup for yesterday at 03:30 UTC
  cron.schedule('30 3 * * *', async () => {
    await withJobAdvisoryLock('monetization-daily', async () => {
      try {
        logger.info('[Postgres] Starting daily monetization aggregation...');
        const games = await monetizationAggregationService.getGamesWithRevenue();

        if (games.length === 0) {
          logger.info('[Postgres] No games with revenue to aggregate');
          return;
        }

        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);

        let success = 0;
        let errors = 0;
        for (const gameId of games) {
          try {
            await monetizationAggregationService.aggregateDaily(gameId, yesterday);
            success++;
          } catch (error) {
            logger.error(`[Postgres] Monetization daily aggregation failed for game ${gameId}:`, error);
            errors++;
          } finally {
            await maybeThrottleAggregation(`monetization-daily-job:${gameId}`);
          }
        }

        logger.info(`[Postgres] Daily monetization aggregation complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('[Postgres] Error in daily monetization aggregation job:', error);
      }
    });
  });

  logger.info('[Postgres] Monetization aggregation cron job started (runs daily at 03:30 UTC)');
}

export function startMonetizationHourlyTodayJob(): void {
  logger.info('[Postgres] Initializing hourly monetization aggregation for today...');

  // Hourly rollup for today at minute 20
  cron.schedule('20 * * * *', async () => {
    await withJobAdvisoryLock('monetization-hourly-today', async () => {
      try {
        logger.info('[Postgres] Starting hourly monetization aggregation for today...');
        const games = await monetizationAggregationService.getGamesWithRevenue();

        if (games.length === 0) {
          logger.info('[Postgres] No games with revenue to aggregate for today');
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
            await monetizationAggregationService.aggregateHourlyIncrementForToday(gameId, hourStart, hourEnd);
            success++;
          } catch (error) {
            logger.error(`[Postgres] Monetization hourly aggregation failed for game ${gameId}:`, error);
            errors++;
          } finally {
            await maybeThrottleAggregation(`monetization-hourly-job:${gameId}`);
          }
        }

        logger.info(`[Postgres] Hourly monetization aggregation complete: ${success} succeeded, ${errors} failed`);
      } catch (error) {
        logger.error('[Postgres] Error in hourly monetization aggregation job:', error);
      }
    });
  });

  logger.info('[Postgres] Monetization hourly aggregation job started (runs hourly at :20 UTC)');
}
