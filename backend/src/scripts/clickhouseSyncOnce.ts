import { runClickHouseSyncOnceWithLock } from '../jobs/clickhouseSync';
import logger from '../utils/logger';

async function main() {
  try {
    logger.info('[ClickHouseSync] Manual sync cycle started');
    await runClickHouseSyncOnceWithLock('manual');
    logger.info('[ClickHouseSync] Manual sync cycle completed');
    process.exit(0);
  } catch (error: any) {
    logger.error('[ClickHouseSync] Manual sync cycle failed', error);
    process.exit(1);
  }
}

void main();
