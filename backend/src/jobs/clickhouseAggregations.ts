import cron from 'node-cron';
import logger from '../utils/logger';
import { withJobAdvisoryLock } from './advisoryLock';
import clickHouseAggregationService from '../services/ClickHouseAggregationService';
import { runClickHouseSyncOnceWithLock } from './clickhouseSync';

type AggregationGroup = 'level_metrics' | 'active_users' | 'cohort' | 'monetization';

type StartClickHouseAggregationJobsOptions = {
  enableLevelMetricsHourly: boolean;
  enableActiveUsersHourly: boolean;
  enableCohortHourly: boolean;
  enableMonetizationHourly: boolean;
};

const GROUP_SCHEDULES: Record<
  AggregationGroup,
  {
    dailyCron: string;
    hourlyCron: string;
    lockDaily: string;
    lockHourly: string;
    dailyLabel: string;
    hourlyLabel: string;
  }
> = {
  level_metrics: {
    dailyCron: '0 2 * * *',
    hourlyCron: '5 * * * *',
    lockDaily: 'ch-level-metrics-daily',
    lockHourly: 'ch-level-metrics-hourly',
    dailyLabel: 'Level metrics',
    hourlyLabel: 'Level metrics hourly'
  },
  active_users: {
    dailyCron: '30 2 * * *',
    hourlyCron: '10 * * * *',
    lockDaily: 'ch-active-users-daily',
    lockHourly: 'ch-active-users-hourly',
    dailyLabel: 'Active users',
    hourlyLabel: 'Active users hourly'
  },
  cohort: {
    dailyCron: '0 3 * * *',
    hourlyCron: '15 * * * *',
    lockDaily: 'ch-cohort-daily',
    lockHourly: 'ch-cohort-hourly',
    dailyLabel: 'Cohort',
    hourlyLabel: 'Cohort hourly'
  },
  monetization: {
    dailyCron: '30 3 * * *',
    hourlyCron: '20 * * * *',
    lockDaily: 'ch-monetization-daily',
    lockHourly: 'ch-monetization-hourly',
    dailyLabel: 'Monetization',
    hourlyLabel: 'Monetization hourly'
  }
};

function yesterdayUtcStart(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function todayUtcStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function runGroupDaily(group: AggregationGroup): Promise<void> {
  const schedule = GROUP_SCHEDULES[group];
  const target = yesterdayUtcStart();

  await withJobAdvisoryLock(schedule.lockDaily, async () => {
    const start = Date.now();
    try {
      logger.info(`[ClickHouseAgg] ${schedule.dailyLabel} daily rebuild started`);
      await clickHouseAggregationService.runGroupForDate(group, target, 'daily');
      logger.info(`[ClickHouseAgg] ${schedule.dailyLabel} daily rebuild finished in ${Date.now() - start}ms`);
    } catch (error) {
      logger.error(`[ClickHouseAgg] ${schedule.dailyLabel} daily rebuild failed`, error);
    }
  });
}

async function runGroupHourly(group: AggregationGroup): Promise<void> {
  const schedule = GROUP_SCHEDULES[group];
  const target = todayUtcStart();
  const clickHousePipelineEnabled =
    process.env.ENABLE_CLICKHOUSE_PIPELINE === '1' || process.env.ENABLE_CLICKHOUSE_PIPELINE === 'true';

  if (clickHousePipelineEnabled) {
    const ranPreSync = await runClickHouseSyncOnceWithLock('hourly-pre-agg');
    if (!ranPreSync) {
      logger.info(`[ClickHouseAgg] ${schedule.hourlyLabel} skipped (sync lock not acquired)`);
      return;
    }
  }

  await withJobAdvisoryLock(schedule.lockHourly, async () => {
    const start = Date.now();
    try {
      logger.info(`[ClickHouseAgg] ${schedule.hourlyLabel} rebuild started`);
      await clickHouseAggregationService.runGroupForDate(group, target, 'hourly');
      logger.info(`[ClickHouseAgg] ${schedule.hourlyLabel} rebuild finished in ${Date.now() - start}ms`);
    } catch (error) {
      logger.error(`[ClickHouseAgg] ${schedule.hourlyLabel} rebuild failed`, error);
    }
  });
}

export function startClickHouseAggregationJobs(options: StartClickHouseAggregationJobsOptions): void {
  if (!clickHouseAggregationService.isEnabled()) {
    logger.warn('[ClickHouseAgg] Aggregation jobs skipped (disabled or ClickHouse unavailable)');
    return;
  }

  logger.info('[ClickHouseAgg] Initializing ClickHouse aggregation cron jobs...');

  const groups: AggregationGroup[] = ['level_metrics', 'active_users', 'cohort', 'monetization'];

  const hourlyEnabledByGroup: Record<AggregationGroup, boolean> = {
    level_metrics: options.enableLevelMetricsHourly,
    active_users: options.enableActiveUsersHourly,
    cohort: options.enableCohortHourly,
    monetization: options.enableMonetizationHourly
  };

  for (const group of groups) {
    if (!clickHouseAggregationService.isGroupEnabled(group)) {
      logger.info(`[ClickHouseAgg] ${group} skipped (group not enabled)`);
      continue;
    }

    const schedule = GROUP_SCHEDULES[group];

    cron.schedule(schedule.dailyCron, async () => {
      await runGroupDaily(group);
    });
    logger.info(`[ClickHouseAgg] ${schedule.dailyLabel} daily cron started (${schedule.dailyCron} UTC)`);

    const hourlyEnabled = hourlyEnabledByGroup[group];

    if (hourlyEnabled) {
      cron.schedule(schedule.hourlyCron, async () => {
        await runGroupHourly(group);
      });
      logger.info(`[ClickHouseAgg] ${schedule.hourlyLabel} cron started (${schedule.hourlyCron} UTC)`);
    } else {
      logger.info(`[ClickHouseAgg] ${schedule.hourlyLabel} cron skipped (hourly flag disabled)`);
    }
  }

  // Startup catch-up for today to reduce lag (only for enabled hourly groups).
  // If pipeline sync is enabled, index.ts already triggers a startup sync cycle.
  // Skip immediate hourly catch-up here to avoid lock-race/noise at boot.
  const clickHousePipelineEnabled =
    process.env.ENABLE_CLICKHOUSE_PIPELINE === '1' || process.env.ENABLE_CLICKHOUSE_PIPELINE === 'true';
  if (clickHousePipelineEnabled) {
    logger.info('[ClickHouseAgg] Startup hourly catch-up skipped (pipeline startup sync is enabled)');
    return;
  }

  void (async () => {
    for (const group of groups) {
      if (!clickHouseAggregationService.isGroupEnabled(group)) continue;
      if (!hourlyEnabledByGroup[group]) continue;
      await runGroupHourly(group);
    }
  })();
}
