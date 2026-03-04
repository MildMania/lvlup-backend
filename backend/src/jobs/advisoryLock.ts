import logger from '../utils/logger';

const { Pool } = require('pg');

const advisoryLockPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

const lockConnectRetryAttempts = Math.max(1, Number(process.env.JOB_LOCK_CONNECT_RETRIES || 3));
const lockConnectRetryDelayMs = Math.max(100, Number(process.env.JOB_LOCK_CONNECT_RETRY_DELAY_MS || 500));

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isTransientLockError(error: unknown): boolean {
  const rawMessage =
    (error as { message?: string } | null | undefined)?.message || String(error || '');
  const message = rawMessage.toLowerCase();
  const code = ((error as { code?: string } | null | undefined)?.code || '').toUpperCase();
  return (
    code === 'P1001' ||
    message.includes("can't reach database server") ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('self-signed certificate') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

async function connectWithRetry(jobName: string): Promise<any | null> {
  for (let attempt = 1; attempt <= lockConnectRetryAttempts; attempt++) {
    try {
      return await advisoryLockPool.connect();
    } catch (error) {
      const willRetry = attempt < lockConnectRetryAttempts && isTransientLockError(error);
      if (willRetry) {
        logger.warn(
          `[${jobName}] Advisory lock DB connect failed (attempt ${attempt}/${lockConnectRetryAttempts}), retrying in ${lockConnectRetryDelayMs}ms`,
          error
        );
        await sleep(lockConnectRetryDelayMs);
        continue;
      }

      logger.error(`[${jobName}] Advisory lock DB connect failed`, error);
      return null;
    }
  }

  return null;
}

export async function withJobAdvisoryLock(jobName: string, run: () => Promise<void>): Promise<void> {
  const lockNamespace = 'lvlup_jobs';
  const lockId = `job:${jobName}`;
  const lockNamespaceHashSql = 'hashtext($1)';
  const lockIdHashSql = 'hashtext($2)';
  const client = await connectWithRetry(jobName);
  if (!client) {
    logger.warn(`Skipping ${jobName}: advisory lock DB unavailable`);
    return;
  }
  let acquired = false;

  try {
    try {
      const result = await client.query(
        `SELECT pg_try_advisory_lock(${lockNamespaceHashSql}, ${lockIdHashSql}) AS acquired`,
        [lockNamespace, lockId]
      );
      acquired = Boolean((result.rows[0] as { acquired?: boolean } | undefined)?.acquired);
    } catch (error) {
      logger.error(`[${jobName}] Advisory lock query failed`, error);
      return;
    }

    if (!acquired) {
      logger.info(`Skipping ${jobName}: advisory lock not acquired`);
      return;
    }

    await run();
  } finally {
    try {
      if (acquired) {
        try {
          await client.query(
            `SELECT pg_advisory_unlock(${lockNamespaceHashSql}, ${lockIdHashSql})`,
            [lockNamespace, lockId]
          );
        } catch (error) {
          logger.warn(`[${jobName}] Failed to release advisory lock`, error);
        }
      }
    } finally {
      client.release();
    }
  }
}
