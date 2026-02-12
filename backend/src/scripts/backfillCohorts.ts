/**
 * Backfill Cohort Rollups
 *
 * Usage:
 * 1. All games, last 30 days:
 *    ts-node src/scripts/backfillCohorts.ts
 *
 * 2. Specific game and date range:
 *    ts-node src/scripts/backfillCohorts.ts <gameId> <startDate> <endDate>
 *    Example: ts-node src/scripts/backfillCohorts.ts abc123 2026-01-01 2026-01-28
 *
 * 3. Via npm script:
 *    npm run backfill:cohorts -- <gameId> <startDate> <endDate>
 */

import cohortAggregationService, { COHORT_DAY_INDICES } from '../services/CohortAggregationService';
import logger from '../utils/logger';

async function backfillCohorts() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 3) {
      const [gameId, startDateStr, endDateStr] = args;
      if (!gameId || !startDateStr || !endDateStr) {
        console.error('Error: Missing required arguments');
        process.exit(1);
      }

      const startDate = new Date(startDateStr + 'T00:00:00.000Z');
      const endDate = new Date(endDateStr + 'T23:59:59.999Z');

      logger.info(`Backfilling cohorts for game ${gameId} from ${startDateStr} to ${endDateStr}`);
      await cohortAggregationService.backfill(gameId, startDate, endDate, COHORT_DAY_INDICES);
      logger.info('✅ Cohort backfill completed successfully!');
      process.exit(0);
    }

    if (args.length === 0) {
      logger.info('Backfilling cohorts for all games (last 30 days, excluding today)');
      const games = await cohortAggregationService.getGamesWithUsers();
      logger.info(`Found ${games.length} games with users`);

      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(23, 59, 59, 999);

      const startDate = new Date(yesterday);
      startDate.setUTCDate(startDate.getUTCDate() - 29);
      startDate.setUTCHours(0, 0, 0, 0);

      logger.info(`Date range: ${startDate.toISOString().split('T')[0]} to ${yesterday.toISOString().split('T')[0]} (today excluded)`);

      let totalSucceeded = 0;
      let totalFailed = 0;
      const failedGames: string[] = [];

      for (const gameId of games) {
        logger.info(`Processing game: ${gameId}`);
        try {
          await cohortAggregationService.backfill(gameId, startDate, yesterday, COHORT_DAY_INDICES);
          totalSucceeded++;
        } catch (error: any) {
          totalFailed++;
          failedGames.push(gameId);
          logger.error(`Failed to backfill game ${gameId}:`, error.message);
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
      }

      logger.info('✅ All games backfilled successfully!');
      process.exit(0);
    }

    console.error('Invalid arguments!');
    console.error('Usage:');
    console.error('  ts-node src/scripts/backfillCohorts.ts');
    console.error('  ts-node src/scripts/backfillCohorts.ts <gameId> <startDate> <endDate>');
    console.error('Example:');
    console.error('  ts-node src/scripts/backfillCohorts.ts abc123 2026-01-01 2026-01-28');
    process.exit(1);
  } catch (error: any) {
    logger.error('❌ Cohort backfill failed:', error.message);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

backfillCohorts();
