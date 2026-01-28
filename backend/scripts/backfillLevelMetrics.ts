import { LevelMetricsAggregationService } from './src/services/LevelMetricsAggregationService';
import logger from './src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Backfill script for Level Metrics Daily table
 * 
 * Usage:
 * 1. Locally:
 *    npx ts-node scripts/backfillLevelMetrics.ts
 * 
 * 2. On Railway via CLI:
 *    railway run npx ts-node scripts/backfillLevelMetrics.ts
 * 
 * 3. Edit the BACKFILL_DAYS variable below to control how many days to backfill
 */

const BACKFILL_DAYS = 30; // How many days back to backfill (adjust as needed)

async function backfill() {
  try {
    logger.info('🔄 Starting Level Metrics Backfill...');
    logger.info(`📅 Backfilling last ${BACKFILL_DAYS} days`);

    const service = new LevelMetricsAggregationService();

    // Calculate date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - BACKFILL_DAYS);
    startDate.setHours(0, 0, 0, 0);

    logger.info(`📍 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get all games with level events
    const games = await service.getGamesWithLevelEvents();
    logger.info(`🎮 Found ${games.length} games with level events`);

    if (games.length === 0) {
      logger.warn('⚠️  No games with level events found. Backfill complete.');
      process.exit(0);
    }

    // Backfill for each game
    let successCount = 0;
    let errorCount = 0;

    for (const gameId of games) {
      try {
        logger.info(`\n▶️  Backfilling for game: ${gameId}`);
        await service.backfillHistorical(gameId, startDate, endDate);
        successCount++;
        logger.info(`✅ Successfully backfilled game: ${gameId}`);
      } catch (error) {
        errorCount++;
        logger.error(`❌ Failed to backfill game ${gameId}:`, error);
      }
    }

    // Summary
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`✅ Backfill Complete!`);
    logger.info(`✅ Successful: ${successCount} games`);
    logger.error(`❌ Failed: ${errorCount} games`);
    logger.info(`${'='.repeat(60)}`);

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    logger.error('💥 Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run backfill
backfill();

