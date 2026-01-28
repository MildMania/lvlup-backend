import { LevelMetricsAggregationService } from '../src/services/LevelMetricsAggregationService';
import logger from '../src/utils/logger';
import * as dotenv from 'dotenv';
import prisma from '../src/prisma';

dotenv.config();

/**
 * Backfill script for Level Metrics Daily table
 * 
 * Usage:
 * 1. Locally (all games):
 *    npx ts-node scripts/backfillLevelMetrics.ts
 * 
 * 2. Locally (specific game):
 *    npx ts-node scripts/backfillLevelMetrics.ts cmkkteznd0076mn1m2dxl1ijd
 * 
 * 3. On Railway via CLI (all games):
 *    railway run npx ts-node scripts/backfillLevelMetrics.ts
 *
 * 4. On Railway via CLI (specific game):
 *    railway run npx ts-node scripts/backfillLevelMetrics.ts cmkkteznd0076mn1m2dxl1ijd
 * 
 * 5. Edit the BACKFILL_DAYS variable below to control how many days to backfill
 */

const BACKFILL_DAYS = 30; // How many days back to backfill (adjust as needed)
const SPECIFIC_GAME_ID = process.argv[2]; // Optional: game ID from command line

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

    // Filter to specific game if provided
    let gamesToProcess = games;
    if (SPECIFIC_GAME_ID) {
      logger.info(`🎯 Filtering to specific game: ${SPECIFIC_GAME_ID}`);
      gamesToProcess = games.filter(g => g === SPECIFIC_GAME_ID);
      if (gamesToProcess.length === 0) {
        logger.error(`❌ Game ${SPECIFIC_GAME_ID} not found or has no level events`);
        process.exit(1);
      }
    }

    if (gamesToProcess.length === 0) {
      logger.warn('⚠️  No games with level events found. Backfill complete.');
      process.exit(0);
    }

    // Backfill for each game
    let successCount = 0;
    let errorCount = 0;

    for (const gameId of gamesToProcess) {
      try {
        logger.info(`\n▶️  Processing game: ${gameId}`);

        // Get count of aggregated rows per date for this game
        const existingCounts = await (prisma as any).levelMetricsDaily.groupBy({
          by: ['date'],
          where: {
            gameId,
            date: {
              gte: startDate,
              lte: endDate
            }
          },
          _count: true
        });

        const aggregatedRowCounts = new Map<string, number>();
        for (const count of existingCounts) {
          const dateStr = (count.date.toISOString().split('T')[0] || '');
          aggregatedRowCounts.set(dateStr, count._count);
        }

        logger.info(`   📊 Found aggregated rows for ${aggregatedRowCounts.size} dates`);

        // Process only missing or incomplete dates
        const currentDate = new Date(startDate);
        let processedDaysForGame = 0;
        let fullyCompleteCount = 0;

        while (currentDate <= endDate) {
          const dateStr = (currentDate.toISOString().split('T')[0] || '');
          const rowCount = aggregatedRowCounts.get(dateStr) ?? 0;

          // Get expected row count for this date
          const eventCount = await (prisma as any).event.count({
            where: {
              gameId,
              eventName: { in: ['level_start', 'level_complete', 'level_failed'] },
              timestamp: {
                gte: new Date(`${dateStr}T00:00:00.000Z`),
                lte: new Date(`${dateStr}T23:59:59.999Z`)
              }
            }
          });

          if (eventCount === 0) {
            logger.debug(`   ⏭️  Skipping ${dateStr} (no events)`);
            fullyCompleteCount++;
          } else if (rowCount > 0 && rowCount >= Math.min(eventCount / 50, 1000)) {
            // Heuristic: if we have reasonable number of rows relative to events, likely complete
            logger.debug(`   ⏭️  Skipping ${dateStr} (${rowCount} rows, likely complete)`);
            fullyCompleteCount++;
          } else {
            logger.debug(`   ⬇️  Aggregating ${dateStr} (${rowCount} existing rows, ${eventCount} events)`);
            await service.aggregateDailyMetrics(gameId, new Date(currentDate));
            processedDaysForGame++;
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }

        logger.info(
          `✅ Game ${gameId}: reprocessed ${processedDaysForGame} dates (${fullyCompleteCount} already complete)`
        );
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`❌ Failed to backfill game ${gameId}:`, error);
      }
    }

    // Summary
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`✅ Smart Backfill Complete!`);
    logger.info(`✅ Successful: ${successCount} games`);
    logger.info(`⏭️  Reprocessed: ${successCount > 0 ? 'Check logs above' : 'N/A'} incomplete dates`);
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

