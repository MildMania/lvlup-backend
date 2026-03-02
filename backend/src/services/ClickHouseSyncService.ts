import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import logger from '../utils/logger';
import clickHouseService from './ClickHouseService';

type SyncTable = 'events' | 'revenue' | 'sessions' | 'users';

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
    const configured = (process.env.CLICKHOUSE_SYNC_TABLES || 'events,revenue,sessions,users')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    this.enabledTables = configured.filter((v): v is SyncTable =>
      v === 'events' || v === 'revenue' || v === 'sessions' || v === 'users'
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

    // Postgres watermark table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "analytics_sync_watermarks" (
        "pipeline" text PRIMARY KEY,
        "lastTs" timestamptz NOT NULL,
        "lastId" text NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

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
    return new Date(row.createdAt);
  }

  private async getWatermark(table: SyncTable): Promise<Watermark> {
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
    if (table === 'events') {
      await clickHouseService.insertJsonEachRow('events_raw', rows.map((r) => ({
        ...r,
        timestamp: this.toIso(r.timestamp),
        serverReceivedAt: this.toIso(r.serverReceivedAt)
      })));
      return;
    }
    if (table === 'revenue') {
      await clickHouseService.insertJsonEachRow('revenue_raw', rows.map((r) => ({
        ...r,
        timestamp: this.toIso(r.timestamp),
        serverReceivedAt: this.toIso(r.serverReceivedAt)
      })));
      return;
    }
    if (table === 'sessions') {
      await clickHouseService.insertJsonEachRow('sessions_raw', rows.map((r) => ({
        ...r,
        startTime: this.toIso(r.startTime),
        endTime: r.endTime ? this.toIso(r.endTime) : null,
        lastHeartbeat: r.lastHeartbeat ? this.toIso(r.lastHeartbeat) : null
      })));
      return;
    }
    await clickHouseService.insertJsonEachRow('users_raw', rows.map((r) => ({
      ...r,
      createdAt: this.toIso(r.createdAt)
    })));
  }

  private toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}

export default new ClickHouseSyncService();

