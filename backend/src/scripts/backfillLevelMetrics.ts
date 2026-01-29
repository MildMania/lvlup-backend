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
      
      try {
        await service.backfillHistorical(gameId, startDate, endDate);
        logger.info('✅ Backfill completed successfully!');
        process.exit(0);
      } catch (error: any) {
        // Check if error contains information about failed dates
        if (error.message?.includes('Failed dates:')) {
          logger.error('⚠️  Backfill completed with some failures:');
          logger.error(error.message);
          logger.info('');
          logger.info('To retry failed dates, run the script again with the same date range.');
          logger.info('The aggregation is idempotent - it will update existing data.');
          process.exit(1);
        } else {
          throw error;
        }
      }
    } else if (args.length === 0) {
      // All games, last 30 days (excluding today)
      logger.info('Backfilling metrics for all games (last 30 days, excluding today)');
      
      const games = await service.getGamesWithLevelEvents();
      logger.info(`Found ${games.length} games with level events`);

      // End date is yesterday (not today - today is handled by real-time queries)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);
      
      const startDate = new Date(yesterday);
      startDate.setDate(startDate.getDate() - 29); // 30 days total including yesterday
      startDate.setHours(0, 0, 0, 0);

      logger.info(`Date range: ${startDate.toISOString().split('T')[0]} to ${yesterday.toISOString().split('T')[0]} (today excluded)`);

      let totalSucceeded = 0;
      let totalFailed = 0;
      const failedGames: string[] = [];

      for (const gameId of games) {
        logger.info(`Processing game: ${gameId}`);
        try {
          await service.backfillHistorical(gameId, startDate, yesterday);
          totalSucceeded++;
        } catch (error: any) {
          totalFailed++;
          failedGames.push(gameId);
          logger.error(`Failed to backfill game ${gameId}:`, error.message);
          // Continue to next game
        }
      }

      logger.info('');
      logger.info('='.repeat(60));
      logger.info('Backfill Summary:');
      logger.info(`  Total games: ${games.length}`);
      logger.info(`  ✅ Succeeded: ${totalSucceeded}`);
      logger.info(`  ❌ Failed: ${totalFailed}`);
      if (failedGames.length > 0) {
        logger.info(`  Failed games: ${failedGames.join(', ')}`);
      }
      logger.info('='.repeat(60));

      if (totalFailed > 0) {
        logger.warn('Some games failed. You can retry them individually.');
        process.exit(1);
      } else {
        logger.info('✅ All games backfilled successfully!');
        process.exit(0);
      }
    } else {
      console.error('Invalid arguments!');
      console.error('Usage:');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts <gameId> <startDate> <endDate>');
      console.error('Example:');
      console.error('  ts-node src/scripts/backfillLevelMetrics.ts abc123 2026-01-01 2026-01-28');
      process.exit(1);
    }
  } catch (error: any) {
    logger.error('❌ Backfill failed:', error.message);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

backfillLevelMetrics();

