import prisma from '../prisma';
import logger from '../utils/logger';

type AdvisoryLockResult = Array<{ acquired: boolean }>;

export async function withJobAdvisoryLock(jobName: string, run: () => Promise<void>): Promise<void> {
  const lockNamespace = 'lvlup_jobs';
  const lockId = `job:${jobName}`;
  let acquired = false;

  try {
    const result = await prisma.$queryRaw<AdvisoryLockResult>`
      SELECT pg_try_advisory_lock(hashtext(${lockNamespace}), hashtext(${lockId})) AS acquired
    `;
    acquired = Boolean(result[0]?.acquired);

    if (!acquired) {
      logger.info(`Skipping ${jobName}: advisory lock not acquired`);
      return;
    }

    await run();
  } finally {
    if (acquired) {
      await prisma.$queryRaw`
        SELECT pg_advisory_unlock(hashtext(${lockNamespace}), hashtext(${lockId}))
      `;
    }
  }
}
