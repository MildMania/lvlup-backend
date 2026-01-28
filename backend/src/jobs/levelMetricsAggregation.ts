import cron from 'node-cron';
import { LevelMetricsAggregationService } from '../services/LevelMetricsAggregationService';
import logger from '../utils/logger';

const aggregationService = new LevelMetricsAggregationService();

/**
 * Daily level metrics aggregation job
 * Runs at 2 AM UTC daily to aggregate the previous day's level events
 */
export function startLevelMetricsAggregationJob(): void {
  logger.info('Initializing level metrics aggregation cron job...');

  // Run at 2 AM UTC every day
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting daily level metrics aggregation...');

      // Get games with level events
      const games = await aggregationService.getGamesWithLevelEvents();
      logger.info(`Found ${games.length} games with level events`);

      if (games.length === 0) {
        logger.info('No games with level events to aggregate');
        return;
      }

      // Aggregate previous day
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      let successCount = 0;
      let errorCount = 0;

      for (const gameId of games) {
        try {
          await aggregationService.aggregateDailyMetrics(gameId, yesterday);
          successCount++;
        } catch (error) {
          logger.error(`Error aggregating metrics for game ${gameId}:`, error);
          errorCount++;
        }
      }

      logger.info(
        `Daily aggregation complete: ${successCount} succeeded, ${errorCount} failed`
      );
    } catch (error) {
      logger.error('Error in daily aggregation job:', error);
    }
  });

  logger.info('Level metrics aggregation cron job started (runs daily at 2 AM UTC)');
}

/**
 * Manual backfill function for testing or historical data
 * Usage: await backfillMetrics('gameId123', new Date('2026-01-01'), new Date('2026-01-28'))
 */
export async function backfillMetrics(
  gameId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  logger.warn(`Manual backfill initiated for game ${gameId}`);
  await aggregationService.backfillHistorical(gameId, startDate, endDate);
  logger.info('Backfill complete');
}

