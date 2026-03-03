import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';
import clickHouseService from './ClickHouseService';

type SyncTable =
  | 'events'
  | 'revenue'
  | 'sessions'
  | 'users'
  | 'cohort_retention_daily'
  | 'cohort_session_metrics_daily'
  | 'level_metrics_daily'
  | 'level_metrics_daily_users'
  | 'level_churn_cohort_daily';

type Watermark = {
  lastTs: Date;
  lastId: string;
};

export class ClickHouseSyncService {
  private prisma: PrismaClient;
  private readonly batchSize: number;
  private readonly maxBatchesPerTable: number;
  private readonly enabledTables: SyncTable[];
  private initialized = false;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
    this.batchSize = Number(process.env.CLICKHOUSE_SYNC_BATCH_SIZE || 10000);
    this.maxBatchesPerTable = Number(process.env.CLICKHOUSE_SYNC_MAX_BATCHES || 5);
    const configured = (process.env.CLICKHOUSE_SYNC_TABLES || 'events,revenue,sessions,users,cohort_retention_daily,cohort_session_metrics_daily,level_metrics_daily,level_metrics_daily_users,level_churn_cohort_daily')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    this.enabledTables = configured.filter((v): v is SyncTable =>
      v === 'events' ||
      v === 'revenue' ||
      v === 'sessions' ||
      v === 'users' ||
      v === 'cohort_retention_daily' ||
      v === 'cohort_session_metrics_daily' ||
      v === 'level_metrics_daily' ||
      v === 'level_metrics_daily_users' ||
      v === 'level_churn_cohort_daily'
    );
  }

  isEnabled(): boolean {
    return clickHouseService.isEnabled();
  }

  async runSyncCycle(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.ensureInitialized();

    for (const table of this.enabledTables) {
      const start = Date.now();
      try {
        const synced = await this.syncTable(table);
        logger.info(`[ClickHouseSync] ${table}: synced ${synced} rows in ${Date.now() - start}ms`);
      } catch (error) {
        logger.error(`[ClickHouseSync] ${table} sync failed`, error);
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await this.ensureWatermarkTable();

    // ClickHouse raw tables (pilot)
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
      CREATE TABLE IF NOT EXISTS sessions_raw (
        id String,
        gameId String,
        userId String,
        startTime DateTime64(3, 'UTC'),
        endTime Nullable(DateTime64(3, 'UTC')),
        lastHeartbeat Nullable(DateTime64(3, 'UTC')),
        duration Nullable(Int32),
        platform String,
        countryCode String,
        version String
      )
      ENGINE = MergeTree
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

    this.initialized = true;
  }

  private async syncTable(table: SyncTable): Promise<number> {
    let total = 0;
    let batches = 0;
    while (batches < this.maxBatchesPerTable) {
      const watermark = await this.getWatermark(table);
      const rows = await this.fetchBatch(table, watermark);
      if (rows.length === 0) break;

      await this.insertBatch(table, rows);
      const last = rows[rows.length - 1] as any;
      const nextTs = this.getRowTimestamp(table, last);
      await this.setWatermark(table, {
        lastTs: nextTs,
        lastId: String(last.id)
      });

      total += rows.length;
      batches += 1;
      if (rows.length < this.batchSize) break;
    }
    return total;
  }

  private getRowTimestamp(table: SyncTable, row: any): Date {
    if (table === 'events' || table === 'revenue') return new Date(row.serverReceivedAt);
    if (table === 'sessions') return new Date(row.startTime);
    if (table === 'cohort_retention_daily' || table === 'cohort_session_metrics_daily') {
      return new Date(row.updatedAt);
    }
    if (table === 'level_metrics_daily' || table === 'level_churn_cohort_daily') {
      return new Date(row.updatedAt);
    }
    if (table === 'level_metrics_daily_users') return new Date(row.createdAt);
    return new Date(row.createdAt);
  }

  private async getWatermark(table: SyncTable): Promise<Watermark> {
    await this.ensureWatermarkTable();
    const pipeline = `clickhouse_sync_${table}`;
    const rows = await this.prisma.$queryRaw<Array<{ lastTs: Date; lastId: string }>>(Prisma.sql`
      SELECT "lastTs", "lastId"
      FROM "analytics_sync_watermarks"
      WHERE "pipeline" = ${pipeline}
      LIMIT 1
    `);

    if (rows.length > 0) return { lastTs: rows[0]!.lastTs, lastId: rows[0]!.lastId };

    // Old baseline to start initial backfill.
    return { lastTs: new Date('1970-01-01T00:00:00.000Z'), lastId: '' };
  }

  private async setWatermark(table: SyncTable, watermark: Watermark): Promise<void> {
    await this.ensureWatermarkTable();
    const pipeline = `clickhouse_sync_${table}`;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "analytics_sync_watermarks" ("pipeline","lastTs","lastId","updatedAt")
      VALUES (${pipeline}, ${watermark.lastTs}, ${watermark.lastId}, now())
      ON CONFLICT ("pipeline")
      DO UPDATE SET
        "lastTs" = EXCLUDED."lastTs",
        "lastId" = EXCLUDED."lastId",
        "updatedAt" = now()
    `);
  }

  private async fetchBatch(table: SyncTable, watermark: Watermark): Promise<any[]> {
    const limit = this.batchSize;
    if (table === 'events') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          e."id",
          e."gameId",
          e."userId",
          e."sessionId",
          e."eventName",
          e."timestamp",
          e."serverReceivedAt",
          COALESCE(e."platform",'') AS "platform",
          COALESCE(e."countryCode",'') AS "countryCode",
          COALESCE(e."appVersion",'') AS "appVersion",
          COALESCE(e."levelFunnel",'') AS "levelFunnel",
          COALESCE(e."levelFunnelVersion",0) AS "levelFunnelVersion",
          COALESCE(e."properties"::text,'{}') AS "propertiesJson"
        FROM "events" e
        WHERE e."serverReceivedAt" IS NOT NULL
          AND (
            e."serverReceivedAt" > ${watermark.lastTs}
            OR (e."serverReceivedAt" = ${watermark.lastTs} AND e."id" > ${watermark.lastId})
          )
        ORDER BY e."serverReceivedAt" ASC, e."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'revenue') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          r."id",
          r."gameId",
          r."userId",
          r."sessionId",
          r."revenueType",
          r."revenueUSD",
          r."currency",
          r."timestamp",
          r."serverReceivedAt",
          COALESCE(r."platform",'') AS "platform",
          COALESCE(r."countryCode",'') AS "countryCode",
          COALESCE(r."appVersion",'') AS "appVersion"
        FROM "revenue" r
        WHERE (
            r."serverReceivedAt" > ${watermark.lastTs}
            OR (r."serverReceivedAt" = ${watermark.lastTs} AND r."id" > ${watermark.lastId})
          )
        ORDER BY r."serverReceivedAt" ASC, r."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'sessions') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          s."id",
          s."gameId",
          s."userId",
          s."startTime",
          s."endTime",
          s."lastHeartbeat",
          s."duration",
          COALESCE(s."platform",'') AS "platform",
          COALESCE(s."countryCode",'') AS "countryCode",
          COALESCE(s."version",'') AS "version"
        FROM "sessions" s
        WHERE (
            s."startTime" > ${watermark.lastTs}
            OR (s."startTime" = ${watermark.lastTs} AND s."id" > ${watermark.lastId})
          )
        ORDER BY s."startTime" ASC, s."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'cohort_retention_daily') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          c."id",
          c."gameId",
          c."installDate",
          c."dayIndex",
          COALESCE(c."platform",'') AS "platform",
          COALESCE(c."countryCode",'') AS "countryCode",
          COALESCE(c."appVersion",'') AS "appVersion",
          c."cohortSize",
          c."retainedUsers",
          c."retainedLevelCompletes",
          c."updatedAt"
        FROM "cohort_retention_daily" c
        WHERE (
            c."updatedAt" > ${watermark.lastTs}
            OR (c."updatedAt" = ${watermark.lastTs} AND c."id" > ${watermark.lastId})
          )
        ORDER BY c."updatedAt" ASC, c."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'cohort_session_metrics_daily') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          c."id",
          c."gameId",
          c."installDate",
          c."dayIndex",
          COALESCE(c."platform",'') AS "platform",
          COALESCE(c."countryCode",'') AS "countryCode",
          COALESCE(c."appVersion",'') AS "appVersion",
          c."cohortSize",
          c."sessionUsers",
          c."totalSessions",
          c."totalDurationSec",
          c."updatedAt"
        FROM "cohort_session_metrics_daily" c
        WHERE (
            c."updatedAt" > ${watermark.lastTs}
            OR (c."updatedAt" = ${watermark.lastTs} AND c."id" > ${watermark.lastId})
          )
        ORDER BY c."updatedAt" ASC, c."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'level_metrics_daily') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          l."id",
          l."gameId",
          l."date",
          l."levelId",
          COALESCE(l."levelFunnel",'') AS "levelFunnel",
          COALESCE(l."levelFunnelVersion",0) AS "levelFunnelVersion",
          COALESCE(l."platform",'') AS "platform",
          COALESCE(l."countryCode",'') AS "countryCode",
          COALESCE(l."appVersion",'') AS "appVersion",
          l."starts",
          l."completes",
          l."fails",
          l."startedPlayers",
          l."completedPlayers",
          l."boosterUsers",
          l."totalBoosterUsage",
          l."egpUsers",
          l."totalEgpUsage",
          l."totalCompletionDuration",
          l."completionCount",
          l."totalFailDuration",
          l."failCount",
          l."createdAt",
          l."updatedAt"
        FROM "level_metrics_daily" l
        WHERE (
            l."updatedAt" > ${watermark.lastTs}
            OR (l."updatedAt" = ${watermark.lastTs} AND l."id" > ${watermark.lastId})
          )
        ORDER BY l."updatedAt" ASC, l."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'level_metrics_daily_users') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          l."id",
          l."gameId",
          l."date",
          l."levelId",
          COALESCE(l."levelFunnel",'') AS "levelFunnel",
          COALESCE(l."levelFunnelVersion",0) AS "levelFunnelVersion",
          COALESCE(l."platform",'') AS "platform",
          COALESCE(l."countryCode",'') AS "countryCode",
          COALESCE(l."appVersion",'') AS "appVersion",
          l."userId",
          l."started",
          l."completed",
          l."boosterUsed",
          l."egpUsed",
          l."starts",
          l."completes",
          l."fails",
          l."totalCompletionDuration",
          l."completionCount",
          l."totalFailDuration",
          l."failCount",
          l."createdAt"
        FROM "level_metrics_daily_users" l
        WHERE (
            l."createdAt" > ${watermark.lastTs}
            OR (l."createdAt" = ${watermark.lastTs} AND l."id" > ${watermark.lastId})
          )
        ORDER BY l."createdAt" ASC, l."id" ASC
        LIMIT ${limit}
      `);
    }

    if (table === 'level_churn_cohort_daily') {
      return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT
          l."id",
          l."gameId",
          l."cohortDate",
          l."installDate",
          l."levelId",
          COALESCE(l."levelFunnel",'') AS "levelFunnel",
          COALESCE(l."levelFunnelVersion",0) AS "levelFunnelVersion",
          COALESCE(l."platform",'') AS "platform",
          COALESCE(l."countryCode",'') AS "countryCode",
          COALESCE(l."appVersion",'') AS "appVersion",
          l."starters",
          l."completedByD0",
          l."completedByD3",
          l."completedByD7",
          l."createdAt",
          l."updatedAt"
        FROM "level_churn_cohort_daily" l
        WHERE (
            l."updatedAt" > ${watermark.lastTs}
            OR (l."updatedAt" = ${watermark.lastTs} AND l."id" > ${watermark.lastId})
          )
        ORDER BY l."updatedAt" ASC, l."id" ASC
        LIMIT ${limit}
      `);
    }

    return this.prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        u."id",
        u."gameId",
        u."externalId",
        u."createdAt",
        COALESCE(u."platform",'') AS "platform",
        COALESCE(u."country",'') AS "country",
        COALESCE(u."version",'') AS "version"
      FROM "users" u
      WHERE (
          u."createdAt" > ${watermark.lastTs}
          OR (u."createdAt" = ${watermark.lastTs} AND u."id" > ${watermark.lastId})
        )
      ORDER BY u."createdAt" ASC, u."id" ASC
      LIMIT ${limit}
    `);
  }

  private async insertBatch(table: SyncTable, rows: any[]): Promise<void> {
    if (rows.length === 0) return;
    const targetTable = this.getTargetTableName(table);
    const dedupedRows = await this.filterAlreadySyncedRows(targetTable, rows);
    if (dedupedRows.length === 0) return;

    if (table === 'events') {
      await clickHouseService.insertJsonEachRow('events_raw', dedupedRows.map((r) => ({
        ...r,
        timestamp: this.toIso(r.timestamp),
        serverReceivedAt: this.toIso(r.serverReceivedAt)
      })));
      return;
    }
    if (table === 'revenue') {
      await clickHouseService.insertJsonEachRow('revenue_raw', dedupedRows.map((r) => ({
        ...r,
        timestamp: this.toIso(r.timestamp),
        serverReceivedAt: this.toIso(r.serverReceivedAt)
      })));
      return;
    }
    if (table === 'sessions') {
      await clickHouseService.insertJsonEachRow('sessions_raw', dedupedRows.map((r) => ({
        ...r,
        startTime: this.toIso(r.startTime),
        endTime: r.endTime ? this.toIso(r.endTime) : null,
        lastHeartbeat: r.lastHeartbeat ? this.toIso(r.lastHeartbeat) : null
      })));
      return;
    }
    if (table === 'cohort_retention_daily') {
      await clickHouseService.insertJsonEachRow('cohort_retention_daily_raw', dedupedRows.map((r) => ({
        ...r,
        dayIndex: this.toNumber(r.dayIndex),
        cohortSize: this.toNumber(r.cohortSize),
        retainedUsers: this.toNumber(r.retainedUsers),
        retainedLevelCompletes: this.toNumber(r.retainedLevelCompletes),
        installDate: this.toIso(r.installDate),
        updatedAt: this.toIso(r.updatedAt)
      })));
      return;
    }
    if (table === 'cohort_session_metrics_daily') {
      await clickHouseService.insertJsonEachRow('cohort_session_metrics_daily_raw', dedupedRows.map((r) => ({
        ...r,
        dayIndex: this.toNumber(r.dayIndex),
        cohortSize: this.toNumber(r.cohortSize),
        sessionUsers: this.toNumber(r.sessionUsers),
        totalSessions: this.toNumber(r.totalSessions),
        totalDurationSec: this.toNumber(r.totalDurationSec),
        installDate: this.toIso(r.installDate),
        updatedAt: this.toIso(r.updatedAt)
      })));
      return;
    }
    if (table === 'level_metrics_daily') {
      await clickHouseService.insertJsonEachRow('level_metrics_daily_raw', dedupedRows.map((r) => ({
        ...r,
        levelId: this.toNumber(r.levelId),
        levelFunnelVersion: this.toNumber(r.levelFunnelVersion),
        starts: this.toNumber(r.starts),
        completes: this.toNumber(r.completes),
        fails: this.toNumber(r.fails),
        startedPlayers: this.toNumber(r.startedPlayers),
        completedPlayers: this.toNumber(r.completedPlayers),
        boosterUsers: this.toNumber(r.boosterUsers),
        totalBoosterUsage: this.toNumber(r.totalBoosterUsage),
        egpUsers: this.toNumber(r.egpUsers),
        totalEgpUsage: this.toNumber(r.totalEgpUsage),
        totalCompletionDuration: this.toNumber(r.totalCompletionDuration),
        completionCount: this.toNumber(r.completionCount),
        totalFailDuration: this.toNumber(r.totalFailDuration),
        failCount: this.toNumber(r.failCount),
        date: this.toIso(r.date),
        createdAt: this.toIso(r.createdAt),
        updatedAt: this.toIso(r.updatedAt)
      })));
      return;
    }
    if (table === 'level_metrics_daily_users') {
      await clickHouseService.insertJsonEachRow('level_metrics_daily_users_raw', dedupedRows.map((r) => ({
        ...r,
        levelId: this.toNumber(r.levelId),
        levelFunnelVersion: this.toNumber(r.levelFunnelVersion),
        started: r.started ? 1 : 0,
        completed: r.completed ? 1 : 0,
        boosterUsed: r.boosterUsed ? 1 : 0,
        egpUsed: r.egpUsed ? 1 : 0,
        starts: this.toNumber(r.starts),
        completes: this.toNumber(r.completes),
        fails: this.toNumber(r.fails),
        totalCompletionDuration: this.toNumber(r.totalCompletionDuration),
        completionCount: this.toNumber(r.completionCount),
        totalFailDuration: this.toNumber(r.totalFailDuration),
        failCount: this.toNumber(r.failCount),
        date: this.toIso(r.date),
        createdAt: this.toIso(r.createdAt)
      })));
      return;
    }
    if (table === 'level_churn_cohort_daily') {
      await clickHouseService.insertJsonEachRow('level_churn_cohort_daily_raw', dedupedRows.map((r) => ({
        ...r,
        levelId: this.toNumber(r.levelId),
        levelFunnelVersion: this.toNumber(r.levelFunnelVersion),
        starters: this.toNumber(r.starters),
        completedByD0: this.toNumber(r.completedByD0),
        completedByD3: this.toNumber(r.completedByD3),
        completedByD7: this.toNumber(r.completedByD7),
        cohortDate: this.toIso(r.cohortDate),
        installDate: this.toIso(r.installDate),
        createdAt: this.toIso(r.createdAt),
        updatedAt: this.toIso(r.updatedAt)
      })));
      return;
    }
    await clickHouseService.insertJsonEachRow('users_raw', dedupedRows.map((r) => ({
      ...r,
      createdAt: this.toIso(r.createdAt)
    })));
  }

  private getTargetTableName(table: SyncTable): string {
    if (table === 'events') return 'events_raw';
    if (table === 'revenue') return 'revenue_raw';
    if (table === 'sessions') return 'sessions_raw';
    if (table === 'users') return 'users_raw';
    if (table === 'cohort_retention_daily') return 'cohort_retention_daily_raw';
    if (table === 'cohort_session_metrics_daily') return 'cohort_session_metrics_daily_raw';
    if (table === 'level_metrics_daily') return 'level_metrics_daily_raw';
    if (table === 'level_metrics_daily_users') return 'level_metrics_daily_users_raw';
    return 'level_churn_cohort_daily_raw';
  }

  private async filterAlreadySyncedRows(targetTable: string, rows: any[]): Promise<any[]> {
    const ids = Array.from(new Set(rows.map((r) => String(r.id))));
    if (ids.length === 0) return rows;
    const existingIds = await this.findExistingIds(targetTable, ids);
    if (existingIds.size === 0) return rows;
    const filtered = rows.filter((r) => !existingIds.has(String(r.id)));
    const skipped = rows.length - filtered.length;
    if (skipped > 0) {
      logger.warn(`[ClickHouseSync] ${targetTable}: skipped ${skipped} rows already present by id`);
    }
    return filtered;
  }

  private async findExistingIds(targetTable: string, ids: string[]): Promise<Set<string>> {
    const chunkSize = 1000;
    const existing = new Set<string>();
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const inList = chunk.map((id) => this.quoteClickHouseString(id)).join(',');
      const rows = await clickHouseService.query<Array<{ id: string }>[number]>(`
        SELECT id
        FROM ${targetTable}
        WHERE id IN (${inList})
      `);
      for (const row of rows) {
        existing.add(String(row.id));
      }
    }
    return existing;
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private async ensureWatermarkTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "analytics_sync_watermarks" (
        "pipeline" text PRIMARY KEY,
        "lastTs" timestamptz NOT NULL,
        "lastId" text NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  private quoteClickHouseString(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    return Number(value ?? 0);
  }
}

export default new ClickHouseSyncService();
