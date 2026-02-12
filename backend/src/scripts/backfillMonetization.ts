import monetizationAggregationService from '../services/MonetizationAggregationService';
import logger from '../utils/logger';

async function backfillMonetization() {
  try {
    const args = process.argv.slice(2);

    if (args.length === 3) {
      const [gameId, startDateStr, endDateStr] = args;
      if (!gameId || !startDateStr || !endDateStr) {
        console.error('Usage: ts-node src/scripts/backfillMonetization.ts <gameId> <startDate> <endDate>');
        process.exit(1);
      }

      const startDate = new Date(startDateStr + 'T00:00:00.000Z');
      const endDate = new Date(endDateStr + 'T23:59:59.999Z');
      await monetizationAggregationService.backfill(gameId, startDate, endDate);
      logger.info('✅ Monetization backfill completed');
      process.exit(0);
    }

    if (args.length === 0) {
      const games = await monetizationAggregationService.getGamesWithRevenue();
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(23, 59, 59, 999);
      const startDate = new Date(yesterday);
      startDate.setUTCDate(startDate.getUTCDate() - 29);
      startDate.setUTCHours(0, 0, 0, 0);

      for (const gameId of games) {
        await monetizationAggregationService.backfill(gameId, startDate, yesterday);
      }

      logger.info('✅ Monetization backfill completed for all games');
      process.exit(0);
    }

    console.error('Usage:');
    console.error('  ts-node src/scripts/backfillMonetization.ts');
    console.error('  ts-node src/scripts/backfillMonetization.ts <gameId> <startDate> <endDate>');
    process.exit(1);
  } catch (error: any) {
    logger.error('❌ Monetization backfill failed:', error.message);
    process.exit(1);
  }
}

backfillMonetization();
