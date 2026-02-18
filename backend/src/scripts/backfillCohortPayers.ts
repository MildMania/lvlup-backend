/**
 * Backfill cohort payer rollups only (cohort_payers_daily)
 *
 * Usage:
 *   npm run backfill:cohort-payers -- <gameId> <startDate> <endDate>
 * Example:
 *   npm run backfill:cohort-payers -- cmkkteznd0076mn1m2dxl1ijd 2026-01-21 2026-02-18
 */
import cohortAggregationService, { COHORT_DAY_INDICES } from '../services/CohortAggregationService';
import logger from '../utils/logger';

async function main() {
  const [gameId, startDateRaw, endDateRaw] = process.argv.slice(2);

  if (!gameId || !startDateRaw || !endDateRaw) {
    logger.error('Usage: npm run backfill:cohort-payers -- <gameId> <startDate> <endDate>');
    process.exit(1);
  }

  const startDate = new Date(startDateRaw);
  const endDate = new Date(endDateRaw);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    logger.error('Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  if (startDate > endDate) {
    logger.error('startDate must be <= endDate');
    process.exit(1);
  }

  logger.info(`Starting cohort payer backfill for game ${gameId} from ${startDateRaw} to ${endDateRaw}`);

  try {
    await cohortAggregationService.backfillPayersOnly(gameId, startDate, endDate, COHORT_DAY_INDICES);
    logger.info('Cohort payer backfill completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Cohort payer backfill failed', error);
    process.exit(1);
  }
}

main();
