import cron from 'node-cron';
import logger from '../utils/logger';
import clickHouseSyncService from '../services/ClickHouseSyncService';
import clickHouseService from '../services/ClickHouseService';
import { withJobAdvisoryLock } from './advisoryLock';

export async function runClickHouseSyncOnce(): Promise<void> {
  if (!clickHouseSyncService.isEnabled()) {
    logger.info('[ClickHouseSync] Skipped (ENABLE_CLICKHOUSE_PIPELINE not enabled)');
    return;
  }

  const healthy = await clickHouseService.ping();
  if (!healthy) {
    logger.warn('[ClickHouseSync] ClickHouse unavailable, skipping cycle');
    return;
  }

  await clickHouseSyncService.runSyncCycle();
}

export async function runClickHouseSyncOnceWithLock(
  context: 'cron' | 'manual' | 'startup' | 'hourly-pre-agg' = 'manual'
): Promise<boolean> {
  const start = Date.now();
  let ran = false;
  await withJobAdvisoryLock('clickhouse-sync', async () => {
    ran = true;
    try {
      await runClickHouseSyncOnce();
      logger.info(`[ClickHouseSync] ${context} cycle complete in ${Date.now() - start}ms`);
    } catch (error) {
      logger.error(`[ClickHouseSync] ${context} cycle failed`, error);
    }
  });
  return ran;
}

export function startClickHouseSyncJob(): void {
  logger.info('Initializing ClickHouse sync job...');

  const cronExpr = process.env.CLICKHOUSE_SYNC_CRON || '*/5 * * * *';
  cron.schedule(cronExpr, async () => {
    await runClickHouseSyncOnceWithLock('cron');
  });

  logger.info(`ClickHouse sync job started (cron: ${cronExpr})`);
}
