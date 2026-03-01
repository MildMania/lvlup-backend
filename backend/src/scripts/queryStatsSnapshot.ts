import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import logger from '../utils/logger';

type QueryStatRow = {
  queryid: string | number | null;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
  query: string;
};

async function main(): Promise<void> {
  const limit = Math.max(1, Number(process.argv[2] || 25));
  const outputDir = process.env.QUERY_STATS_OUTPUT_DIR || path.resolve(process.cwd(), 'logs', 'query-stats');
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(outputDir, `query-stats-${stamp}.json`);

  const header = await prisma.$queryRawUnsafe<Array<{ db: string; now: Date }>>(
    `SELECT current_database() AS db, now() AS now`
  );

  const topByTotal = await prisma.$queryRawUnsafe<QueryStatRow[]>(
    `
    SELECT
      queryid::text,
      calls::bigint::int,
      total_exec_time,
      mean_exec_time,
      rows::bigint::int,
      query
    FROM pg_stat_statements
    ORDER BY total_exec_time DESC
    LIMIT $1
    `,
    limit
  );

  const topByCalls = await prisma.$queryRawUnsafe<QueryStatRow[]>(
    `
    SELECT
      queryid::text,
      calls::bigint::int,
      total_exec_time,
      mean_exec_time,
      rows::bigint::int,
      query
    FROM pg_stat_statements
    ORDER BY calls DESC
    LIMIT $1
    `,
    limit
  );

  const topByRows = await prisma.$queryRawUnsafe<QueryStatRow[]>(
    `
    SELECT
      queryid::text,
      calls::bigint::int,
      total_exec_time,
      mean_exec_time,
      rows::bigint::int,
      query
    FROM pg_stat_statements
    ORDER BY rows DESC
    LIMIT $1
    `,
    limit
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        capturedAt: now.toISOString(),
        database: header[0]?.db || null,
        topByTotalExecTime: topByTotal,
        topByCalls,
        topByRowsReturned: topByRows
      },
      null,
      2
    )
  );

  logger.info(`[queryStatsSnapshot] Wrote snapshot to ${outputFile}`);
}

main()
  .catch((error) => {
    logger.error('[queryStatsSnapshot] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

