import logger from '../utils/logger';

const { Pool } = require('pg');

function createAdvisoryLockPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: Math.max(2000, Number(process.env.JOB_LOCK_CONNECT_TIMEOUT_MS || 10000)),
    idleTimeoutMillis: Math.max(1000, Number(process.env.JOB_LOCK_IDLE_TIMEOUT_MS || 30000)),
    keepAlive: true,
    keepAliveInitialDelayMillis: Math.max(1000, Number(process.env.JOB_LOCK_KEEPALIVE_INITIAL_DELAY_MS || 5000))
  });
}

let advisoryLockPool = createAdvisoryLockPool();

const lockConnectRetryAttempts = Math.max(1, Number(process.env.JOB_LOCK_CONNECT_RETRIES || 6));
const lockConnectRetryDelayMs = Math.max(100, Number(process.env.JOB_LOCK_CONNECT_RETRY_DELAY_MS || 1000));
const lockConnectRetryMaxDelayMs = Math.max(
  lockConnectRetryDelayMs,
  Number(process.env.JOB_LOCK_CONNECT_RETRY_MAX_DELAY_MS || 5000)
);
const enableJobAdvisoryLocks = !(
  process.env.ENABLE_JOB_ADVISORY_LOCKS === '0' ||
  process.env.ENABLE_JOB_ADVISORY_LOCKS === 'false'
);
const jobLockFailOpen =
  process.env.JOB_LOCK_FAIL_OPEN === '1' ||
  process.env.JOB_LOCK_FAIL_OPEN === 'true';

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

async function resetPoolSafely(jobName: string): Promise<void> {
  const currentPool = advisoryLockPool;
  advisoryLockPool = createAdvisoryLockPool();
  try {
    await currentPool.end();
  } catch (error) {
    logger.warn(`[${jobName}] Advisory lock pool reset: close old pool failed`, error);
  }
}

async function connectWithRetry(jobName: string): Promise<any | null> {
  for (let attempt = 1; attempt <= lockConnectRetryAttempts; attempt++) {
    try {
      return await advisoryLockPool.connect();
    } catch (error) {
      const willRetry = attempt < lockConnectRetryAttempts && isTransientLockError(error);
      if (willRetry) {
        const backoff = Math.min(
          lockConnectRetryDelayMs * Math.pow(2, attempt - 1),
          lockConnectRetryMaxDelayMs
        );
        logger.warn(
          `[${jobName}] Advisory lock DB connect failed (attempt ${attempt}/${lockConnectRetryAttempts}), retrying in ${backoff}ms`,
          error
        );
        await resetPoolSafely(jobName);
        await sleep(backoff);
        continue;
      }

      logger.error(`[${jobName}] Advisory lock DB connect failed`, error);
      return null;
    }
  }

  return null;
}

export async function withJobAdvisoryLock(jobName: string, run: () => Promise<void>): Promise<void> {
  if (!enableJobAdvisoryLocks) {
    logger.warn(`[${jobName}] Advisory locks disabled (ENABLE_JOB_ADVISORY_LOCKS=0); running job without lock`);
    await run();
    return;
  }

  const lockNamespace = 'lvlup_jobs';
  const lockId = `job:${jobName}`;
  const lockNamespaceHashSql = 'hashtext($1)';
  const lockIdHashSql = 'hashtext($2)';
  const client = await connectWithRetry(jobName);
  if (!client) {
    if (jobLockFailOpen) {
      logger.warn(`[${jobName}] Advisory lock DB unavailable; JOB_LOCK_FAIL_OPEN enabled, running without lock`);
      await run();
      return;
    }
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
      if (jobLockFailOpen) {
        logger.warn(`[${jobName}] JOB_LOCK_FAIL_OPEN enabled, running without lock after lock-query failure`);
        await run();
      }
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
