import logger from '../utils/logger';
import clickHouseService from './ClickHouseService';

type AggregationGroup = 'level_metrics' | 'active_users' | 'cohort' | 'monetization';

const DEFAULT_GROUPS: AggregationGroup[] = ['level_metrics', 'active_users', 'cohort', 'monetization'];
const DEFAULT_COHORT_DAY_INDICES = [
  ...Array.from({ length: 31 }, (_, i) => i),
  60,
  90,
  180,
  360,
  540,
  720
];

export class ClickHouseAggregationService {
  private initialized = false;
  private readonly enabled: boolean;
  private readonly enabledGroups: Set<AggregationGroup>;
  private readonly cohortDayIndices: number[];

  constructor() {
    this.enabled = this.envTrue('ENABLE_CLICKHOUSE_AGGREGATION_JOBS');

    const configuredGroups = (process.env.CLICKHOUSE_AGGREGATION_GROUPS || DEFAULT_GROUPS.join(','))
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean) as string[];

    this.enabledGroups = new Set(
      configuredGroups.filter(
        (v): v is AggregationGroup =>
          v === 'level_metrics' ||
          v === 'active_users' ||
          v === 'cohort' ||
          v === 'monetization'
      )
    );

    if (this.enabledGroups.size === 0) {
      for (const group of DEFAULT_GROUPS) this.enabledGroups.add(group);
    }

    const parsedDayIndices = (process.env.CLICKHOUSE_COHORT_DAY_INDICES || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0)
      .map((v) => Math.floor(v));

    this.cohortDayIndices = Array.from(
      new Set(parsedDayIndices.length ? parsedDayIndices : DEFAULT_COHORT_DAY_INDICES)
    ).sort((a, b) => a - b);
  }

  isEnabled(): boolean {
    return this.enabled && clickHouseService.isEnabled();
  }

  isGroupEnabled(group: AggregationGroup): boolean {
    return this.enabledGroups.has(group);
  }

  async runGroupForDate(group: AggregationGroup, targetDate: Date, mode: 'daily' | 'hourly'): Promise<void> {
    if (!this.isEnabled()) return;
    if (!this.isGroupEnabled(group)) {
      logger.info(`[ClickHouseAgg] ${group} skipped (group not enabled)`);
      return;
    }

    await this.ensureInitialized();

    const day = this.toDayString(targetDate);
    const startedAt = Date.now();

    if (group === 'level_metrics') {
      await this.rebuildLevelMetricsForDate(day, mode);
    } else if (group === 'active_users') {
      await this.rebuildActiveUsersForDate(day);
    } else if (group === 'cohort') {
      await this.rebuildCohortForTargetDate(day);
    } else if (group === 'monetization') {
      await this.rebuildMonetizationForDate(day);
    }

    logger.info(`[ClickHouseAgg] ${group} ${mode} rebuild complete for ${day} in ${Date.now() - startedAt}ms`);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS events_raw (
        id String,
        gameId String,
        userId String,
        sessionId Nullable(String),
        eventName String,
        timestamp DateTime64(3, 'UTC'),
        serverReceivedAt DateTime64(3, 'UTC'),
        platform String,
        countryCode String,
        appVersion String,
        levelFunnel String,
        levelFunnelVersion Int32,
        propertiesJson String
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(serverReceivedAt)
      ORDER BY (gameId, serverReceivedAt, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS revenue_raw (
        id String,
        gameId String,
        userId String,
        sessionId Nullable(String),
        revenueType String,
        revenueUSD Float64,
        currency String,
        timestamp DateTime64(3, 'UTC'),
        serverReceivedAt DateTime64(3, 'UTC'),
        platform String,
        countryCode String,
        appVersion String
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(serverReceivedAt)
      ORDER BY (gameId, serverReceivedAt, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS sessions_raw_v2 (
        id String,
        gameId String,
        userId String,
        startTime DateTime64(3, 'UTC'),
        endTime Nullable(DateTime64(3, 'UTC')),
        lastHeartbeat Nullable(DateTime64(3, 'UTC')),
        duration Nullable(Int32),
        platform String,
        countryCode String,
        version String,
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = ReplacingMergeTree(updatedAt)
      PARTITION BY toYYYYMM(startTime)
      ORDER BY (gameId, startTime, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS users_raw (
        id String,
        gameId String,
        externalId String,
        createdAt DateTime64(3, 'UTC'),
        platform String,
        country String,
        version String
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(createdAt)
      ORDER BY (gameId, createdAt, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS level_metrics_daily_raw (
        id String,
        gameId String,
        date DateTime64(3, 'UTC'),
        levelId Int32,
        levelFunnel String,
        levelFunnelVersion Int32,
        platform String,
        countryCode String,
        appVersion String,
        starts Int32,
        completes Int32,
        fails Int32,
        startedPlayers Int32,
        completedPlayers Int32,
        boosterUsers Int32,
        totalBoosterUsage Int32,
        egpUsers Int32,
        totalEgpUsage Int32,
        totalCompletionDuration Int64,
        completionCount Int32,
        totalFailDuration Int64,
        failCount Int32,
        createdAt DateTime64(3, 'UTC'),
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(date)
      ORDER BY (gameId, date, levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS level_metrics_daily_users_raw (
        id String,
        gameId String,
        date DateTime64(3, 'UTC'),
        levelId Int32,
        levelFunnel String,
        levelFunnelVersion Int32,
        platform String,
        countryCode String,
        appVersion String,
        userId String,
        started UInt8,
        completed UInt8,
        boosterUsed UInt8,
        egpUsed UInt8,
        starts Int32,
        completes Int32,
        fails Int32,
        totalCompletionDuration Int64,
        completionCount Int32,
        totalFailDuration Int64,
        failCount Int32,
        createdAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(date)
      ORDER BY (gameId, date, levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion, userId, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS level_churn_cohort_daily_raw (
        id String,
        gameId String,
        cohortDate DateTime64(3, 'UTC'),
        installDate DateTime64(3, 'UTC'),
        levelId Int32,
        levelFunnel String,
        levelFunnelVersion Int32,
        platform String,
        countryCode String,
        appVersion String,
        starters Int32,
        completedByD0 Int32,
        completedByD3 Int32,
        completedByD7 Int32,
        createdAt DateTime64(3, 'UTC'),
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(cohortDate)
      ORDER BY (gameId, cohortDate, installDate, levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS cohort_retention_daily_raw (
        id String,
        gameId String,
        installDate DateTime64(3, 'UTC'),
        dayIndex Int32,
        platform String,
        countryCode String,
        appVersion String,
        cohortSize Int32,
        retainedUsers Int32,
        retainedLevelCompletes Int32,
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(installDate)
      ORDER BY (gameId, installDate, dayIndex, platform, countryCode, appVersion, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS cohort_session_metrics_daily_raw (
        id String,
        gameId String,
        installDate DateTime64(3, 'UTC'),
        dayIndex Int32,
        platform String,
        countryCode String,
        appVersion String,
        cohortSize Int32,
        sessionUsers Int32,
        totalSessions Int32,
        totalDurationSec Int32,
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(installDate)
      ORDER BY (gameId, installDate, dayIndex, platform, countryCode, appVersion, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS active_users_daily_raw (
        id String,
        gameId String,
        date DateTime64(3, 'UTC'),
        platform String,
        countryCode String,
        appVersion String,
        dau Int32,
        createdAt DateTime64(3, 'UTC'),
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(date)
      ORDER BY (gameId, date, platform, countryCode, appVersion, id)
    `);

    await clickHouseService.command(`
      CREATE TABLE IF NOT EXISTS monetization_daily_rollups_raw (
        id String,
        gameId String,
        date DateTime64(3, 'UTC'),
        totalRevenueUsd Float64,
        adRevenueUsd Float64,
        iapRevenueUsd Float64,
        adImpressionCount Int32,
        iapCount Int32,
        updatedAt DateTime64(3, 'UTC')
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(date)
      ORDER BY (gameId, date, id)
    `);

    this.initialized = true;
  }

  private async rebuildLevelMetricsForDate(day: string, mode: 'daily' | 'hourly'): Promise<void> {
    const qDay = this.q(day);

    await clickHouseService.command(`
      ALTER TABLE level_metrics_daily_users_raw
      DELETE WHERE toDate(date) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO level_metrics_daily_users_raw
      WITH
        toDate(${qDay}) AS target_day,
        day_events AS (
          SELECT
            gameId,
            userId,
            eventName,
            timestamp,
            ifNull(levelFunnel, '') AS levelFunnel,
            toInt32(ifNull(levelFunnelVersion, 0)) AS levelFunnelVersion,
            lower(ifNull(platform, '')) AS platform,
            propertiesJson,
            toInt32(JSONExtractInt(propertiesJson, 'levelId')) AS levelId
          FROM events_raw
          WHERE toDate(timestamp) = target_day
            AND eventName IN ('level_start', 'level_complete', 'level_failed')
            AND JSONHas(propertiesJson, 'levelId')
        ),
        canonical_dims AS (
          SELECT
            gameId,
            userId,
            levelId,
            argMin(levelFunnel, timestamp) AS levelFunnel,
            toInt32(argMin(levelFunnelVersion, timestamp)) AS levelFunnelVersion,
            argMin(platform, timestamp) AS platform
          FROM day_events
          GROUP BY gameId, userId, levelId
        )
      SELECT
        concat(
          'lmdu_',
          lower(hex(MD5(concat(
            e.gameId, '|',
            toString(target_day), '|',
            toString(c.levelId), '|',
            c.levelFunnel, '|',
            toString(c.levelFunnelVersion), '|',
            c.platform, '|',
            '', '|',
            '', '|',
            e.userId
          ))))
        ) AS id,
        e.gameId,
        toDateTime64(target_day, 3, 'UTC') AS date,
        c.levelId,
        c.levelFunnel,
        c.levelFunnelVersion,
        c.platform,
        '' AS countryCode,
        '' AS appVersion,
        e.userId,
        toUInt8(max(e.eventName = 'level_start')) AS started,
        toUInt8(max(e.eventName = 'level_complete')) AS completed,
        toUInt8(max(
          if(
            e.eventName IN ('level_complete', 'level_failed')
            AND replaceAll(ifNull(JSONExtractRaw(e.propertiesJson, 'boosters'), ''), ' ', '') NOT IN ('', '{}', 'null'),
            1,
            0
          )
        )) AS boosterUsed,
        toUInt8(max(
          if(
            e.eventName IN ('level_complete', 'level_failed')
            AND (
              toFloat64OrZero(JSONExtractRaw(e.propertiesJson, 'egp')) > 0
              OR lower(ifNull(JSONExtractRaw(e.propertiesJson, 'endGamePurchase'), 'false')) = 'true'
            ),
            1,
            0
          )
        )) AS egpUsed,
        toInt32(countIf(e.eventName = 'level_start')) AS starts,
        toInt32(countIf(e.eventName = 'level_complete')) AS completes,
        toInt32(countIf(e.eventName = 'level_failed')) AS fails,
        toInt64(sumIf(toFloat64OrZero(JSONExtractRaw(e.propertiesJson, 'timeSeconds')), e.eventName = 'level_complete')) AS totalCompletionDuration,
        toInt32(countIf(e.eventName = 'level_complete' AND toFloat64OrZero(JSONExtractRaw(e.propertiesJson, 'timeSeconds')) > 0)) AS completionCount,
        toInt64(sumIf(toFloat64OrZero(JSONExtractRaw(e.propertiesJson, 'timeSeconds')), e.eventName = 'level_failed')) AS totalFailDuration,
        toInt32(countIf(e.eventName = 'level_failed' AND toFloat64OrZero(JSONExtractRaw(e.propertiesJson, 'timeSeconds')) > 0)) AS failCount,
        now64(3) AS createdAt
      FROM day_events e
      INNER JOIN canonical_dims c
        ON c.gameId = e.gameId
       AND c.userId = e.userId
       AND c.levelId = e.levelId
      GROUP BY
        e.gameId,
        e.userId,
        c.levelId,
        c.levelFunnel,
        c.levelFunnelVersion,
        c.platform
    `);

    await clickHouseService.command(`
      ALTER TABLE level_metrics_daily_raw
      DELETE WHERE toDate(date) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO level_metrics_daily_raw
      WITH toDate(${qDay}) AS target_day
      SELECT
        concat(
          'lmd_',
          lower(hex(MD5(concat(
            gameId, '|',
            toString(target_day), '|',
            toString(levelId), '|',
            levelFunnel, '|',
            toString(levelFunnelVersion), '|',
            platform, '|',
            countryCode, '|',
            appVersion
          ))))
        ) AS id,
        gameId,
        toDateTime64(target_day, 3, 'UTC') AS date,
        levelId,
        levelFunnel,
        levelFunnelVersion,
        platform,
        countryCode,
        appVersion,
        toInt32(sum(starts)) AS starts,
        toInt32(sum(completes)) AS completes,
        toInt32(sum(fails)) AS fails,
        toInt32(countIf(started = 1)) AS startedPlayers,
        toInt32(countIf(completed = 1)) AS completedPlayers,
        toInt32(countIf(boosterUsed = 1)) AS boosterUsers,
        toInt32(sum(toInt32(boosterUsed))) AS totalBoosterUsage,
        toInt32(countIf(egpUsed = 1)) AS egpUsers,
        toInt32(sum(toInt32(egpUsed))) AS totalEgpUsage,
        toInt64(sum(totalCompletionDuration)) AS totalCompletionDuration,
        toInt32(sum(completionCount)) AS completionCount,
        toInt64(sum(totalFailDuration)) AS totalFailDuration,
        toInt32(sum(failCount)) AS failCount,
        now64(3) AS createdAt,
        now64(3) AS updatedAt
      FROM level_metrics_daily_users_raw
      WHERE toDate(date) = target_day
      GROUP BY gameId, levelId, levelFunnel, levelFunnelVersion, platform, countryCode, appVersion
    `);

    const targetDate = new Date(`${day}T00:00:00.000Z`);
    const cohortStart = new Date(targetDate);
    cohortStart.setUTCDate(cohortStart.getUTCDate() - 7);
    const cohortStartDay = this.toDayString(cohortStart);

    await clickHouseService.command(`
      ALTER TABLE level_churn_cohort_daily_raw
      DELETE WHERE toDate(cohortDate) >= toDate(${this.q(cohortStartDay)})
        AND toDate(cohortDate) <= toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO level_churn_cohort_daily_raw
      WITH
        toDate(${this.q(cohortStartDay)}) AS cohort_start,
        toDate(${qDay}) AS cohort_end,
        users_min AS (
          SELECT
            gameId,
            id AS userId,
            min(createdAt) AS createdAt
          FROM users_raw
          GROUP BY gameId, id
        ),
        starter_rows AS (
          SELECT DISTINCT
            l.gameId AS gameId,
            toDate(l.date) AS cohortDate,
            toDate(u.createdAt) AS installDate,
            l.levelId AS levelId,
            l.levelFunnel AS levelFunnel,
            l.levelFunnelVersion AS levelFunnelVersion,
            l.platform AS platform,
            '' AS countryCode,
            '' AS appVersion,
            l.userId AS userId
          FROM level_metrics_daily_users_raw l
          INNER JOIN users_min u
            ON u.userId = l.userId
           AND u.gameId = l.gameId
          WHERE l.started = 1
            AND toDate(l.date) >= cohort_start
            AND toDate(l.date) <= cohort_end
        ),
        first_completion AS (
          SELECT
            l.gameId AS gameId,
            l.levelId AS levelId,
            l.levelFunnel AS levelFunnel,
            l.levelFunnelVersion AS levelFunnelVersion,
            l.platform AS platform,
            l.userId AS userId,
            min(toDate(l.date)) AS firstCompletionDate
          FROM level_metrics_daily_users_raw l
          WHERE l.completed = 1
            AND toDate(l.date) >= cohort_start
            AND toDate(l.date) <= addDays(cohort_end, 7)
          GROUP BY
            l.gameId,
            l.levelId,
            l.levelFunnel,
            l.levelFunnelVersion,
            l.platform,
            l.userId
        )
      SELECT
        concat(
          'lccd_',
          lower(hex(MD5(concat(
            s.gameId, '|',
            toString(s.cohortDate), '|',
            toString(s.installDate), '|',
            toString(s.levelId), '|',
            s.levelFunnel, '|',
            toString(s.levelFunnelVersion), '|',
            s.platform, '|',
            s.countryCode, '|',
            s.appVersion
          ))))
        ) AS id,
        s.gameId,
        toDateTime64(s.cohortDate, 3, 'UTC') AS cohortDate,
        toDateTime64(s.installDate, 3, 'UTC') AS installDate,
        s.levelId,
        s.levelFunnel,
        s.levelFunnelVersion,
        s.platform,
        s.countryCode,
        s.appVersion,
        toInt32(count()) AS starters,
        toInt32(countIf(fc.firstCompletionDate >= s.cohortDate AND fc.firstCompletionDate <= s.cohortDate)) AS completedByD0,
        toInt32(countIf(fc.firstCompletionDate >= s.cohortDate AND fc.firstCompletionDate <= addDays(s.cohortDate, 3))) AS completedByD3,
        toInt32(countIf(fc.firstCompletionDate >= s.cohortDate AND fc.firstCompletionDate <= addDays(s.cohortDate, 7))) AS completedByD7,
        now64(3) AS createdAt,
        now64(3) AS updatedAt
      FROM starter_rows s
      LEFT JOIN first_completion fc
        ON fc.gameId = s.gameId
       AND fc.levelId = s.levelId
       AND fc.levelFunnel = s.levelFunnel
       AND fc.levelFunnelVersion = s.levelFunnelVersion
       AND fc.platform = s.platform
       AND fc.userId = s.userId
      GROUP BY
        s.gameId,
        s.cohortDate,
        s.installDate,
        s.levelId,
        s.levelFunnel,
        s.levelFunnelVersion,
        s.platform,
        s.countryCode,
        s.appVersion
    `);

    if (mode === 'hourly') {
      logger.debug(`[ClickHouseAgg] level_metrics hourly full-day rebuild finished for ${day}`);
    }
  }

  private async rebuildCohortForTargetDate(day: string): Promise<void> {
    const qDay = this.q(day);
    const dayIndexExpr = this.cohortDayIndices.join(',');

    await clickHouseService.command(`
      ALTER TABLE cohort_retention_daily_raw
      DELETE WHERE toDate(addDays(installDate, dayIndex)) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO cohort_retention_daily_raw
      WITH
        toDate(${qDay}) AS target_day,
        [${dayIndexExpr}] AS day_indices,
        users_min AS (
          SELECT
            gameId,
            id AS userId,
            toDate(min(createdAt)) AS installDate
          FROM users_raw
          GROUP BY gameId, id
        ),
        cohort_users AS (
          SELECT
            u.gameId,
            u.userId,
            u.installDate,
            arrayJoin(day_indices) AS dayIndex
          FROM users_min u
          WHERE addDays(u.installDate, dayIndex) = target_day
        ),
        user_dims AS (
          SELECT
            cu.gameId,
            cu.userId,
            argMin(ifNull(e.platform, ''), e.serverReceivedAt) AS platform,
            argMin(ifNull(e.countryCode, ''), e.serverReceivedAt) AS countryCode,
            argMin(ifNull(e.appVersion, ''), e.serverReceivedAt) AS appVersion
          FROM cohort_users cu
          LEFT JOIN events_raw e
            ON e.gameId = cu.gameId
           AND e.userId = cu.userId
           AND toDate(e.serverReceivedAt) = cu.installDate
          GROUP BY cu.gameId, cu.userId
        ),
        retained AS (
          SELECT gameId, userId, 1 AS retained
          FROM events_raw
          WHERE toDate(serverReceivedAt) = target_day
          GROUP BY gameId, userId
        ),
        completes AS (
          SELECT gameId, userId, toInt32(countIf(eventName = 'level_complete')) AS levelCompletes
          FROM events_raw
          WHERE toDate(serverReceivedAt) = target_day
          GROUP BY gameId, userId
        )
      SELECT
        concat(
          'crd_',
          cu.gameId, '_',
          formatDateTime(cu.installDate, '%Y-%m-%d'), '_',
          toString(cu.dayIndex), '_',
          ifNull(d.platform, ''), '_',
          ifNull(d.countryCode, ''), '_',
          ifNull(d.appVersion, '')
        ) AS id,
        cu.gameId AS gameId,
        toDateTime64(cu.installDate, 3, 'UTC') AS installDate,
        cu.dayIndex AS dayIndex,
        ifNull(d.platform, '') AS platform,
        ifNull(d.countryCode, '') AS countryCode,
        ifNull(d.appVersion, '') AS appVersion,
        toInt32(count()) AS cohortSize,
        toInt32(countIf(ifNull(r.retained, 0) = 1)) AS retainedUsers,
        toInt32(sum(toInt32(ifNull(co.levelCompletes, 0)))) AS retainedLevelCompletes,
        now64(3) AS updatedAt
      FROM cohort_users cu
      LEFT JOIN user_dims d
        ON d.gameId = cu.gameId
       AND d.userId = cu.userId
      LEFT JOIN retained r
        ON r.gameId = cu.gameId
       AND r.userId = cu.userId
      LEFT JOIN completes co
        ON co.gameId = cu.gameId
       AND co.userId = cu.userId
      GROUP BY
        cu.gameId,
        cu.installDate,
        cu.dayIndex,
        ifNull(d.platform, ''),
        ifNull(d.countryCode, ''),
        ifNull(d.appVersion, '')
    `);

    await clickHouseService.command(`
      ALTER TABLE cohort_session_metrics_daily_raw
      DELETE WHERE toDate(addDays(installDate, dayIndex)) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO cohort_session_metrics_daily_raw
      WITH
        toDate(${qDay}) AS target_day,
        [${dayIndexExpr}] AS day_indices,
        users_min AS (
          SELECT
            gameId,
            id AS userId,
            toDate(min(createdAt)) AS installDate
          FROM users_raw
          GROUP BY gameId, id
        ),
        cohort_users AS (
          SELECT
            u.gameId,
            u.userId,
            u.installDate,
            arrayJoin(day_indices) AS dayIndex
          FROM users_min u
          WHERE addDays(u.installDate, dayIndex) = target_day
        ),
        user_dims AS (
          SELECT
            cu.gameId,
            cu.userId,
            argMin(ifNull(e.platform, ''), e.serverReceivedAt) AS platform,
            argMin(ifNull(e.countryCode, ''), e.serverReceivedAt) AS countryCode,
            argMin(ifNull(e.appVersion, ''), e.serverReceivedAt) AS appVersion
          FROM cohort_users cu
          LEFT JOIN events_raw e
            ON e.gameId = cu.gameId
           AND e.userId = cu.userId
           AND toDate(e.serverReceivedAt) = cu.installDate
          GROUP BY cu.gameId, cu.userId
        ),
        sessions_by_user AS (
          SELECT
            s.gameId,
            s.userId,
            toInt32(countIf(durationSec > 0)) AS totalSessions,
            toInt32(sumIf(durationSec, durationSec > 0)) AS totalDurationSec
          FROM (
            SELECT
              gameId,
              userId,
              if(
                duration > 0,
                toInt64(duration),
                if(
                  (endTime IS NOT NULL) OR (lastHeartbeat IS NOT NULL),
                  greatest(toInt64(dateDiff('second', startTime, ifNull(lastHeartbeat, endTime))), 0),
                  toInt64(0)
                )
              ) AS durationSec
            FROM sessions_raw_v2
            WHERE toDate(startTime) = target_day
          ) s
          GROUP BY s.gameId, s.userId
        )
      SELECT
        concat(
          'csd_',
          cu.gameId, '_',
          formatDateTime(cu.installDate, '%Y-%m-%d'), '_',
          toString(cu.dayIndex), '_',
          ifNull(d.platform, ''), '_',
          ifNull(d.countryCode, ''), '_',
          ifNull(d.appVersion, '')
        ) AS id,
        cu.gameId AS gameId,
        toDateTime64(cu.installDate, 3, 'UTC') AS installDate,
        cu.dayIndex AS dayIndex,
        ifNull(d.platform, '') AS platform,
        ifNull(d.countryCode, '') AS countryCode,
        ifNull(d.appVersion, '') AS appVersion,
        toInt32(count()) AS cohortSize,
        toInt32(countIf(toInt32(ifNull(s.totalSessions, 0)) > 0)) AS sessionUsers,
        toInt32(sum(toInt32(ifNull(s.totalSessions, 0)))) AS totalSessions,
        toInt32(sum(toInt32(ifNull(s.totalDurationSec, 0)))) AS totalDurationSec,
        now64(3) AS updatedAt
      FROM cohort_users cu
      LEFT JOIN user_dims d
        ON d.gameId = cu.gameId
       AND d.userId = cu.userId
      LEFT JOIN sessions_by_user s
        ON s.gameId = cu.gameId
       AND s.userId = cu.userId
      GROUP BY
        cu.gameId,
        cu.installDate,
        cu.dayIndex,
        ifNull(d.platform, ''),
        ifNull(d.countryCode, ''),
        ifNull(d.appVersion, '')
    `);
  }

  private async rebuildActiveUsersForDate(day: string): Promise<void> {
    const qDay = this.q(day);

    await clickHouseService.command(`
      ALTER TABLE active_users_daily_raw
      DELETE WHERE toDate(date) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO active_users_daily_raw
      WITH toDate(${qDay}) AS target_day
      SELECT
        concat(
          'aud_',
          lower(hex(MD5(concat(
            gameId, '|',
            toString(target_day), '|',
            platform, '|',
            countryCode, '|',
            appVersion
          ))))
        ) AS id,
        gameId,
        toDateTime64(target_day, 3, 'UTC') AS date,
        platform,
        countryCode,
        appVersion,
        toInt32(uniqExact(userId)) AS dau,
        now64(3) AS createdAt,
        now64(3) AS updatedAt
      FROM (
        SELECT
          gameId,
          userId,
          lower(ifNull(platform, '')) AS platform,
          ifNull(countryCode, '') AS countryCode,
          ifNull(appVersion, '') AS appVersion
        FROM events_raw
        WHERE toDate(serverReceivedAt) = target_day
        GROUP BY gameId, userId, platform, countryCode, appVersion
      ) e
      GROUP BY gameId, platform, countryCode, appVersion
    `);
  }

  private async rebuildMonetizationForDate(day: string): Promise<void> {
    const qDay = this.q(day);

    await clickHouseService.command(`
      ALTER TABLE monetization_daily_rollups_raw
      DELETE WHERE toDate(date) = toDate(${qDay})
      SETTINGS mutations_sync = 1
    `);

    await clickHouseService.command(`
      INSERT INTO monetization_daily_rollups_raw
      WITH toDate(${qDay}) AS target_day
      SELECT
        concat('mdr_', lower(hex(MD5(concat(gameId, '|', toString(target_day)))))) AS id,
        gameId,
        toDateTime64(target_day, 3, 'UTC') AS date,
        toFloat64(sum(revenueUSD)) AS totalRevenueUsd,
        toFloat64(sumIf(revenueUSD, revenueType = 'AD_IMPRESSION')) AS adRevenueUsd,
        toFloat64(sumIf(revenueUSD, revenueType = 'IN_APP_PURCHASE')) AS iapRevenueUsd,
        toInt32(countIf(revenueType = 'AD_IMPRESSION')) AS adImpressionCount,
        toInt32(countIf(revenueType = 'IN_APP_PURCHASE')) AS iapCount,
        now64(3) AS updatedAt
      FROM revenue_raw
      WHERE toDate(timestamp) = target_day
      GROUP BY gameId
    `);
  }

  private envTrue(key: string): boolean {
    const value = process.env[key];
    return value === '1' || value === 'true';
  }

  private q(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private toDayString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}

export default new ClickHouseAggregationService();
