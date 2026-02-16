import logger from '../utils/logger';

const { Pool } = require('pg');

const advisoryLockPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

export async function withJobAdvisoryLock(jobName: string, run: () => Promise<void>): Promise<void> {
  const lockNamespace = 'lvlup_jobs';
  const lockId = `job:${jobName}`;
  const lockNamespaceHashSql = 'hashtext($1)';
  const lockIdHashSql = 'hashtext($2)';
  const client = await advisoryLockPool.connect();
  let acquired = false;

  try {
    const result = await client.query(
      `SELECT pg_try_advisory_lock(${lockNamespaceHashSql}, ${lockIdHashSql}) AS acquired`,
      [lockNamespace, lockId]
    );
    acquired = Boolean((result.rows[0] as { acquired?: boolean } | undefined)?.acquired);

    if (!acquired) {
      logger.info(`Skipping ${jobName}: advisory lock not acquired`);
      return;
    }

    await run();
  } finally {
    try {
      if (acquired) {
        await client.query(
          `SELECT pg_advisory_unlock(${lockNamespaceHashSql}, ${lockIdHashSql})`,
          [lockNamespace, lockId]
        );
      }
    } finally {
      client.release();
    }
  }
}
