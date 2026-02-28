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

export function startClickHouseSyncJob(): void {
  logger.info('Initializing ClickHouse sync job...');

  const cronExpr = process.env.CLICKHOUSE_SYNC_CRON || '*/5 * * * *';
  cron.schedule(cronExpr, async () => {
    await withJobAdvisoryLock('clickhouse-sync', async () => {
      const start = Date.now();
      try {
        await runClickHouseSyncOnce();
        logger.info(`[ClickHouseSync] cycle complete in ${Date.now() - start}ms`);
      } catch (error) {
        logger.error('[ClickHouseSync] cycle failed', error);
      }
    });
  });

  logger.info(`ClickHouse sync job started (cron: ${cronExpr})`);
}

