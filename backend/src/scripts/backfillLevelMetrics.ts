/**
 * Backfill Level Metrics Script
 * 
 * Usage:
 * 1. All games, last 30 days:
 *    ts-node src/scripts/backfillLevelMetrics.ts
 * 
 * 2. Specific game and date range:
 *    ts-node src/scripts/backfillLevelMetrics.ts <gameId> <startDate> <endDate>
 *    Example: ts-node src/scripts/backfillLevelMetrics.ts abc123 2026-01-01 2026-01-28
 * 
 * 3. Via npm script:
 *    npm run backfill:level-metrics
 */

import { LevelMetricsAggregationService } from '../services/LevelMetricsAggregationService';
import logger from '../utils/logger';

async function backfillLevelMetrics() {
  const service = new LevelMetricsAggregationService();

  try {
    const args = process.argv.slice(2);

    if (args.length === 3) {
      // Specific game and date range
      const [gameId, startDateStr, endDateStr] = args;
      
      if (!gameId || !startDateStr || !endDateStr) {
        console.error('Error: Missing required arguments');
        process.exit(1);
      }
      
      const startDate = new Date(startDateStr + 'T00:00:00.000Z');
      const endDate = new Date(endDateStr + 'T23:59:59.999Z');

      logger.info(`Backfilling metrics for game ${gameId} from ${startDateStr} to ${endDateStr}`);
      await service.backfillHistorical(gameId, startDate, endDate);
      logger.info('Backfill completed successfully!');
    } else if (args.length === 0) {
      // All games, last 30 days
      logger.info('Backfilling metrics for all games (last 30 days)');
      
      const games = await service.getGamesWithLevelEvents();
      logger.info(`Found ${games.length} games with level events`);

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);

      for (const gameId of games) {
        logger.info(`Processing game: ${gameId}`);
        try {
          await service.backfillHistorical(gameId, startDate, endDate);
        } catch (error) {
          logger.error(`Failed to backfill game ${gameId}:`, error);
        }
      }

      logger.info('Backfill completed for all games!');
    } else {
      console.error('Invalid arguments!');
      console.error('Usage:');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts <gameId> <startDate> <endDate>');
      console.error('Example:');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts abc123 2026-01-01 2026-01-28');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillLevelMetrics();

