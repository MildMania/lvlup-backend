import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import clickHouseService from './ClickHouseService';
import logger from '../utils/logger';

export interface HealthFilters {
  startDate: Date;
  endDate: Date;
  platform?: string;
  country?: string;
  appVersion?: string;
}

export interface CrashMetrics {
  totalCrashes: number;
  crashRate: number;
  crashFreeUserRate: number;
  crashFreeSessionRate: number;
  affectedUsers: number;
  totalUsers: number;
  crashesByType: Array<{ type: string; count: number }>;
  crashesBySeverity: Array<{ severity: string; count: number }>;
  topCrashes: Array<{
    id: string;
    message: string;
    exceptionType: string;
    count: number;
    affectedUsers: number;
    lastOccurrence: Date;
  }>;
  totalCrashGroups: number; // For pagination
}

export interface CrashTimeline {
  date: string;
  crashes: number;
  affectedUsers: number;
  totalUsers: number;
  crashRate: number;
}

type CrashLogRecord = {
  id: string;
  gameId: string;
  userId?: string | null;
  sessionId?: string | null;
  crashType: string;
  severity: string;
  message: string;
  stackTrace: string;
  exceptionType?: string | null;
  platform?: string | null;
  osVersion?: string | null;
  manufacturer?: string | null;
  device?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  appBuild?: string | null;
  bundleId?: string | null;
  engineVersion?: string | null;
  sdkVersion?: string | null;
  country?: string | null;
  connectionType?: string | null;
  memoryUsage?: number | null;
  batteryLevel?: number | null;
  diskSpace?: number | null;
  breadcrumbs?: string | null;
  customData?: string | null;
  timestamp: string | Date;
  resolved?: number | boolean;
  resolvedAt?: string | Date | null;
};

export class HealthMetricsService {
  private prismaClient: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prismaClient = prismaClient || prisma;
  }

  private readFromClickHouse(): boolean {
    return (
      process.env.ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE === '1' ||
      process.env.ANALYTICS_READ_HEALTH_FROM_CLICKHOUSE === 'true'
    );
  }

  private isClickHouseStrict(): boolean {
    return (
      process.env.ANALYTICS_CLICKHOUSE_STRICT === '1' ||
      process.env.ANALYTICS_CLICKHOUSE_STRICT === 'true'
    );
  }

  private quote(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private chCrashWhere(gameId: string, filters: HealthFilters): string {
    const where = [
      `gameId = ${this.quote(gameId)}`,
      `timestamp >= parseDateTime64BestEffort(${this.quote(filters.startDate.toISOString())})`,
      `timestamp <= parseDateTime64BestEffort(${this.quote(filters.endDate.toISOString())})`,
    ];

    if (filters.platform) where.push(`platform = ${this.quote(filters.platform)}`);
    if (filters.country) where.push(`country = ${this.quote(filters.country)}`);
    if (filters.appVersion) where.push(`appVersion = ${this.quote(filters.appVersion)}`);

    return where.join(' AND ');
  }

  private chSessionWhere(gameId: string, filters: HealthFilters): string {
    const where = [
      `gameId = ${this.quote(gameId)}`,
      `startTime >= parseDateTime64BestEffort(${this.quote(filters.startDate.toISOString())})`,
      `startTime <= parseDateTime64BestEffort(${this.quote(filters.endDate.toISOString())})`,
    ];

    if (filters.platform) where.push(`platform = ${this.quote(filters.platform)}`);
    if (filters.appVersion) where.push(`version = ${this.quote(filters.appVersion)}`);

    return where.join(' AND ');
  }

  private mapCrashRow(row: CrashLogRecord): any {
    return {
      ...row,
      timestamp: new Date(row.timestamp),
      resolved: row.resolved === true || row.resolved === 1,
      resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
    };
  }

  async getCrashMetrics(
    gameId: string,
    filters: HealthFilters & {
      crashesLimit?: number;
      crashesOffset?: number;
    }
  ): Promise<CrashMetrics> {
    if (this.readFromClickHouse()) {
      if (this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
        throw new Error('ClickHouse strict mode enabled for health metrics, but ClickHouse is not configured/enabled in API env');
      }
      if (clickHouseService.isEnabled()) {
        try {
          return await this.getCrashMetricsFromClickHouse(gameId, filters);
        } catch (error) {
          if (this.isClickHouseStrict()) throw error;
          logger.warn('[Health] ClickHouse crash metrics read failed; falling back to Postgres', {
            gameId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.getCrashMetricsFromPostgres(gameId, filters);
  }

  private async getCrashMetricsFromClickHouse(
    gameId: string,
    filters: HealthFilters & { crashesLimit?: number; crashesOffset?: number }
  ): Promise<CrashMetrics> {
    const { crashesLimit = 15, crashesOffset = 0 } = filters;
    const crashWhere = this.chCrashWhere(gameId, filters);
    const sessionWhere = this.chSessionWhere(gameId, filters);

    const [summaryRows, crashesByType, crashesBySeverity, groupedRows, groupedCountRows] = await Promise.all([
      clickHouseService.query<Array<{
        totalCrashes: number;
        totalSessions: number;
        totalUsers: number;
        affectedUsers: number;
        sessionsWithCrashes: number;
      }>[number]>(`
        SELECT
          (SELECT count() FROM crash_logs_raw WHERE ${crashWhere}) AS totalCrashes,
          (SELECT count() FROM sessions_raw_v2 WHERE ${sessionWhere}) AS totalSessions,
          (SELECT uniqExact(userId) FROM sessions_raw_v2 WHERE ${sessionWhere}) AS totalUsers,
          (SELECT uniqExact(userId) FROM crash_logs_raw WHERE ${crashWhere} AND userId IS NOT NULL AND userId != '') AS affectedUsers,
          (SELECT uniqExact(sessionId) FROM crash_logs_raw WHERE ${crashWhere} AND sessionId IS NOT NULL AND sessionId != '') AS sessionsWithCrashes
      `),
      clickHouseService.query<Array<{ crashType: string; cnt: number }>[number]>(`
        SELECT crashType, toInt64(count()) AS cnt
        FROM crash_logs_raw
        WHERE ${crashWhere}
        GROUP BY crashType
      `),
      clickHouseService.query<Array<{ severity: string; cnt: number }>[number]>(`
        SELECT severity, toInt64(count()) AS cnt
        FROM crash_logs_raw
        WHERE ${crashWhere}
        GROUP BY severity
      `),
      clickHouseService.query<Array<{
        id: string;
        message: string;
        exceptionType: string;
        cnt: number;
        affectedUsers: number;
        lastOccurrence: string;
      }>[number]>(`
        SELECT
          argMax(id, timestamp) AS id,
          message,
          exceptionTypeKey AS exceptionType,
          toInt64(count()) AS cnt,
          toInt64(uniqExactIf(userId, userId IS NOT NULL AND userId != '')) AS affectedUsers,
          max(timestamp) AS lastOccurrence
        FROM (
          SELECT
            id,
            message,
            ifNull(exceptionType, 'Unknown') AS exceptionTypeKey,
            userId,
            timestamp
          FROM crash_logs_raw
          WHERE ${crashWhere}
        ) c
        GROUP BY message, exceptionTypeKey
        ORDER BY cnt DESC
        LIMIT ${crashesLimit}
        OFFSET ${crashesOffset}
      `),
      clickHouseService.query<Array<{ totalCrashGroups: number }>[number]>(`
        SELECT toInt64(count()) AS totalCrashGroups
        FROM (
          SELECT message, exceptionTypeKey
          FROM (
            SELECT
              message,
              ifNull(exceptionType, 'Unknown') AS exceptionTypeKey
            FROM crash_logs_raw
            WHERE ${crashWhere}
          ) c
          GROUP BY message, exceptionTypeKey
        )
      `)
    ]);

    const summary = summaryRows[0] || {
      totalCrashes: 0,
      totalSessions: 0,
      totalUsers: 0,
      affectedUsers: 0,
      sessionsWithCrashes: 0,
    };

    const totalCrashes = Number(summary.totalCrashes || 0);
    const totalSessions = Number(summary.totalSessions || 0);
    const totalUsers = Number(summary.totalUsers || 0);
    const affectedUsers = Number(summary.affectedUsers || 0);
    const sessionsWithCrashes = Number(summary.sessionsWithCrashes || 0);

    const crashRate = totalSessions > 0 ? (sessionsWithCrashes / totalSessions) * 100 : 0;
    const crashFreeUserRate = totalUsers > 0 ? ((totalUsers - affectedUsers) / totalUsers) * 100 : 100;
    const crashFreeSessionRate = totalSessions > 0 ? ((totalSessions - sessionsWithCrashes) / totalSessions) * 100 : 100;

    return {
      totalCrashes,
      crashRate: Number(crashRate.toFixed(2)),
      crashFreeUserRate: Number(crashFreeUserRate.toFixed(2)),
      crashFreeSessionRate: Number(crashFreeSessionRate.toFixed(2)),
      affectedUsers,
      totalUsers,
      crashesByType: crashesByType.map((c) => ({ type: c.crashType, count: Number(c.cnt || 0) })),
      crashesBySeverity: crashesBySeverity.map((c) => ({ severity: c.severity, count: Number(c.cnt || 0) })),
      topCrashes: groupedRows.map((c) => ({
        id: c.id,
        message: c.message,
        exceptionType: c.exceptionType || 'Unknown',
        count: Number(c.cnt || 0),
        affectedUsers: Number(c.affectedUsers || 0),
        lastOccurrence: new Date(c.lastOccurrence),
      })),
      totalCrashGroups: Number(groupedCountRows[0]?.totalCrashGroups || 0),
    };
  }

  private async getCrashMetricsFromPostgres(
    gameId: string,
    filters: HealthFilters & { crashesLimit?: number; crashesOffset?: number }
  ): Promise<CrashMetrics> {
    const { startDate, endDate, platform, country, appVersion, crashesLimit = 15, crashesOffset = 0 } = filters;

    const crashConditions: Prisma.Sql[] = [
      Prisma.sql`"gameId" = ${gameId}`,
      Prisma.sql`"timestamp" >= ${startDate}`,
      Prisma.sql`"timestamp" <= ${endDate}`,
    ];
    if (platform) crashConditions.push(Prisma.sql`"platform" = ${platform}`);
    if (country) crashConditions.push(Prisma.sql`"country" = ${country}`);
    if (appVersion) crashConditions.push(Prisma.sql`"appVersion" = ${appVersion}`);
    const crashWhereSql = Prisma.sql`${Prisma.join(crashConditions, ' AND ')}`;

    const sessionConditions: Prisma.Sql[] = [
      Prisma.sql`"gameId" = ${gameId}`,
      Prisma.sql`"startTime" >= ${startDate}`,
      Prisma.sql`"startTime" <= ${endDate}`,
    ];
    if (platform) sessionConditions.push(Prisma.sql`"platform" = ${platform}`);
    if (appVersion) sessionConditions.push(Prisma.sql`"version" = ${appVersion}`);
    const sessionWhereSql = Prisma.sql`${Prisma.join(sessionConditions, ' AND ')}`;

    const [crashSummaryRows, sessionSummaryRows] = await Promise.all([
      this.prismaClient.$queryRaw<
        Array<{ total_crashes: bigint; affected_users: bigint; sessions_with_crashes: bigint }>
      >(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "total_crashes",
          COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL)::bigint AS "affected_users",
          COUNT(DISTINCT "sessionId") FILTER (WHERE "sessionId" IS NOT NULL)::bigint AS "sessions_with_crashes"
        FROM "crash_logs"
        WHERE ${crashWhereSql}
      `),
      this.prismaClient.$queryRaw<Array<{ total_sessions: bigint; total_users: bigint }>>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "total_sessions",
          COUNT(DISTINCT "userId")::bigint AS "total_users"
        FROM "sessions"
        WHERE ${sessionWhereSql}
      `),
    ]);

    const totalCrashes = Number(crashSummaryRows[0]?.total_crashes || 0);
    const affectedUsers = Number(crashSummaryRows[0]?.affected_users || 0);
    const sessionsWithCrashes = Number(crashSummaryRows[0]?.sessions_with_crashes || 0);
    const totalSessions = Number(sessionSummaryRows[0]?.total_sessions || 0);
    const totalUsers = Number(sessionSummaryRows[0]?.total_users || 0);

    const crashRate = totalSessions > 0 ? (sessionsWithCrashes / totalSessions) * 100 : 0;
    const crashFreeUserRate = totalUsers > 0 ? ((totalUsers - affectedUsers) / totalUsers) * 100 : 100;
    const crashFreeSessionRate = totalSessions > 0 ? ((totalSessions - sessionsWithCrashes) / totalSessions) * 100 : 100;

    const [crashesByType, crashesBySeverity, topCrashRows, totalCrashGroupRows] = await Promise.all([
      this.prismaClient.$queryRaw<Array<{ crash_type: string; count: bigint }>>(Prisma.sql`
        SELECT "crashType" AS "crash_type", COUNT(*)::bigint AS "count"
        FROM "crash_logs"
        WHERE ${crashWhereSql}
        GROUP BY "crashType"
      `),
      this.prismaClient.$queryRaw<Array<{ severity: string; count: bigint }>>(Prisma.sql`
        SELECT "severity" AS "severity", COUNT(*)::bigint AS "count"
        FROM "crash_logs"
        WHERE ${crashWhereSql}
        GROUP BY "severity"
      `),
      this.prismaClient.$queryRaw<
        Array<{
          id: string;
          message: string;
          exception_type: string;
          count: bigint;
          affected_users: bigint;
          last_occurrence: Date;
        }>
      >(Prisma.sql`
        WITH grouped AS (
          SELECT
            "message",
            COALESCE("exceptionType", 'Unknown') AS "exception_type",
            COUNT(*)::bigint AS "count",
            COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL)::bigint AS "affected_users",
            MAX("timestamp") AS "last_occurrence"
          FROM "crash_logs"
          WHERE ${crashWhereSql}
          GROUP BY "message", COALESCE("exceptionType", 'Unknown')
        ),
        latest AS (
          SELECT DISTINCT ON ("message", COALESCE("exceptionType", 'Unknown'))
            "id",
            "message",
            COALESCE("exceptionType", 'Unknown') AS "exception_type",
            "timestamp"
          FROM "crash_logs"
          WHERE ${crashWhereSql}
          ORDER BY "message", COALESCE("exceptionType", 'Unknown'), "timestamp" DESC
        )
        SELECT
          latest."id" AS "id",
          grouped."message" AS "message",
          grouped."exception_type" AS "exception_type",
          grouped."count" AS "count",
          grouped."affected_users" AS "affected_users",
          grouped."last_occurrence" AS "last_occurrence"
        FROM grouped
        JOIN latest
          ON latest."message" = grouped."message"
         AND latest."exception_type" = grouped."exception_type"
        ORDER BY grouped."count" DESC
        LIMIT ${crashesLimit}
        OFFSET ${crashesOffset}
      `),
      this.prismaClient.$queryRaw<Array<{ total_crash_groups: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total_crash_groups"
        FROM (
          SELECT 1
          FROM "crash_logs"
          WHERE ${crashWhereSql}
          GROUP BY "message", COALESCE("exceptionType", 'Unknown')
        ) t
      `),
    ]);

    const totalCrashGroups = Number(totalCrashGroupRows[0]?.total_crash_groups || 0);
    const topCrashes = topCrashRows.map((row) => ({
      id: row.id,
      message: row.message,
      exceptionType: row.exception_type || 'Unknown',
      count: Number(row.count || 0),
      affectedUsers: Number(row.affected_users || 0),
      lastOccurrence: row.last_occurrence,
    }));

    return {
      totalCrashes,
      crashRate: Number(crashRate.toFixed(2)),
      crashFreeUserRate: Number(crashFreeUserRate.toFixed(2)),
      crashFreeSessionRate: Number(crashFreeSessionRate.toFixed(2)),
      affectedUsers,
      totalUsers,
      crashesByType: crashesByType.map((c) => ({
        type: c.crash_type,
        count: Number(c.count || 0),
      })),
      crashesBySeverity: crashesBySeverity.map((c) => ({
        severity: c.severity,
        count: Number(c.count || 0),
      })),
      topCrashes,
      totalCrashGroups,
    };
  }

  async getCrashTimeline(gameId: string, filters: HealthFilters): Promise<CrashTimeline[]> {
    if (this.readFromClickHouse()) {
      if (this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
        throw new Error('ClickHouse strict mode enabled for health timeline, but ClickHouse is not configured/enabled in API env');
      }
      if (clickHouseService.isEnabled()) {
        try {
          return await this.getCrashTimelineFromClickHouse(gameId, filters);
        } catch (error) {
          if (this.isClickHouseStrict()) throw error;
          logger.warn('[Health] ClickHouse crash timeline read failed; falling back to Postgres', {
            gameId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.getCrashTimelineFromPostgres(gameId, filters);
  }

  private async getCrashTimelineFromClickHouse(gameId: string, filters: HealthFilters): Promise<CrashTimeline[]> {
    const crashWhere = this.chCrashWhere(gameId, filters);
    const sessionWhere = this.chSessionWhere(gameId, filters);

    const [crashes, sessions] = await Promise.all([
      clickHouseService.query<Array<{ date: string; crashes: number; affectedUsers: number }>[number]>(`
        SELECT
          formatDateTime(toDate(timestamp), '%Y-%m-%d') AS date,
          toInt64(count()) AS crashes,
          toInt64(uniqExactIf(userId, userId IS NOT NULL AND userId != '')) AS affectedUsers
        FROM crash_logs_raw
        WHERE ${crashWhere}
        GROUP BY toDate(timestamp)
      `),
      clickHouseService.query<Array<{ date: string; totalUsers: number }>[number]>(`
        SELECT
          formatDateTime(toDate(startTime), '%Y-%m-%d') AS date,
          toInt64(uniqExact(userId)) AS totalUsers
        FROM sessions_raw_v2
        WHERE ${sessionWhere}
        GROUP BY toDate(startTime)
      `)
    ]);

    const byDate = new Map<string, CrashTimeline>();
    for (const row of sessions) {
      byDate.set(String(row.date), {
        date: String(row.date),
        crashes: 0,
        affectedUsers: 0,
        totalUsers: Number(row.totalUsers || 0),
        crashRate: 0,
      });
    }

    for (const row of crashes) {
      const date = String(row.date);
      const existing = byDate.get(date) || {
        date,
        crashes: 0,
        affectedUsers: 0,
        totalUsers: 0,
        crashRate: 0,
      };
      existing.crashes = Number(row.crashes || 0);
      existing.affectedUsers = Number(row.affectedUsers || 0);
      byDate.set(date, existing);
    }

    return Array.from(byDate.values())
      .map((row) => ({
        ...row,
        crashRate: row.totalUsers > 0 ? Number(((row.crashes / row.totalUsers) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getCrashTimelineFromPostgres(gameId: string, filters: HealthFilters): Promise<CrashTimeline[]> {
    const { startDate, endDate, platform, country, appVersion } = filters;

    const crashConditions: Prisma.Sql[] = [
      Prisma.sql`"gameId" = ${gameId}`,
      Prisma.sql`"timestamp" >= ${startDate}`,
      Prisma.sql`"timestamp" <= ${endDate}`,
    ];
    if (platform) crashConditions.push(Prisma.sql`"platform" = ${platform}`);
    if (country) crashConditions.push(Prisma.sql`"country" = ${country}`);
    if (appVersion) crashConditions.push(Prisma.sql`"appVersion" = ${appVersion}`);
    const crashWhereSql = Prisma.sql`${Prisma.join(crashConditions, ' AND ')}`;

    const sessionConditions: Prisma.Sql[] = [
      Prisma.sql`"gameId" = ${gameId}`,
      Prisma.sql`"startTime" >= ${startDate}`,
      Prisma.sql`"startTime" <= ${endDate}`,
    ];
    if (platform) sessionConditions.push(Prisma.sql`"platform" = ${platform}`);
    if (appVersion) sessionConditions.push(Prisma.sql`"version" = ${appVersion}`);
    const sessionWhereSql = Prisma.sql`${Prisma.join(sessionConditions, ' AND ')}`;

    const [crashRows, sessionRows] = await Promise.all([
      this.prismaClient.$queryRaw<Array<{ day: Date; crashes: bigint; affected_users: bigint }>>(Prisma.sql`
        SELECT
          date_trunc('day', "timestamp")::date AS "day",
          COUNT(*)::bigint AS "crashes",
          COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL)::bigint AS "affected_users"
        FROM "crash_logs"
        WHERE ${crashWhereSql}
        GROUP BY 1
      `),
      this.prismaClient.$queryRaw<Array<{ day: Date; total_users: bigint }>>(Prisma.sql`
        SELECT
          date_trunc('day', "startTime")::date AS "day",
          COUNT(DISTINCT "userId")::bigint AS "total_users"
        FROM "sessions"
        WHERE ${sessionWhereSql}
        GROUP BY 1
      `),
    ]);

    const timeline: CrashTimeline[] = [];
    const usersByDate = new Map<string, number>();
    const crashesByDate = new Map<string, { count: number; affectedUsers: number }>();

    for (const row of sessionRows) {
      const dateStr = row.day.toISOString().split('T')[0];
      if (!dateStr) continue;
      usersByDate.set(dateStr, Number(row.total_users || 0));
    }

    for (const row of crashRows) {
      const dateStr = row.day.toISOString().split('T')[0];
      if (!dateStr) continue;
      crashesByDate.set(dateStr, {
        count: Number(row.crashes || 0),
        affectedUsers: Number(row.affected_users || 0),
      });
    }

    const allDates = new Set([...usersByDate.keys(), ...crashesByDate.keys()]);
    for (const dateStr of allDates) {
      const crashData = crashesByDate.get(dateStr) || { count: 0, affectedUsers: 0 };
      const totalUsers = usersByDate.get(dateStr) || 0;
      const crashRate = totalUsers > 0 ? (crashData.count / totalUsers) * 100 : 0;

      timeline.push({
        date: dateStr,
        crashes: crashData.count,
        affectedUsers: crashData.affectedUsers,
        totalUsers,
        crashRate: Number(crashRate.toFixed(2)),
      });
    }

    return timeline.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getCrashDetails(crashId: string) {
    if (this.readFromClickHouse()) {
      if (this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
        throw new Error('ClickHouse strict mode enabled for crash details, but ClickHouse is not configured/enabled in API env');
      }
      if (clickHouseService.isEnabled()) {
        try {
          const rows = await clickHouseService.query<Array<CrashLogRecord>[number]>(`
            SELECT *
            FROM crash_logs_raw
            WHERE id = ${this.quote(crashId)}
            ORDER BY timestamp DESC
            LIMIT 1
          `);
          if (!rows[0]) return null;
          return this.mapCrashRow(rows[0]);
        } catch (error) {
          if (this.isClickHouseStrict()) throw error;
          logger.warn('[Health] ClickHouse crash details read failed; falling back to Postgres', {
            crashId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.prismaClient.crashLog.findUnique({
      where: { id: crashId },
    });
  }

  async getErrorInstances(
    gameId: string,
    message: string | undefined,
    exceptionType: string | undefined,
    filters: HealthFilters & { limit?: number; offset?: number }
  ) {
    if (this.readFromClickHouse()) {
      if (this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
        throw new Error('ClickHouse strict mode enabled for error instances, but ClickHouse is not configured/enabled in API env');
      }
      if (clickHouseService.isEnabled()) {
        try {
          return await this.getErrorInstancesFromClickHouse(gameId, message, exceptionType, filters);
        } catch (error) {
          if (this.isClickHouseStrict()) throw error;
          logger.warn('[Health] ClickHouse error instances read failed; falling back to Postgres', {
            gameId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.getErrorInstancesFromPostgres(gameId, message, exceptionType, filters);
  }

  private async getErrorInstancesFromClickHouse(
    gameId: string,
    message: string | undefined,
    exceptionType: string | undefined,
    filters: HealthFilters & { limit?: number; offset?: number }
  ) {
    const { limit = 50, offset = 0 } = filters;
    const conditions = [this.chCrashWhere(gameId, filters)];
    if (message) conditions.push(`message = ${this.quote(message)}`);
    if (exceptionType) conditions.push(`exceptionType = ${this.quote(exceptionType)}`);
    const whereSql = conditions.join(' AND ');

    const [countRows, rows] = await Promise.all([
      clickHouseService.query<Array<{ totalCount: number }>[number]>(`
        SELECT toInt64(count()) AS totalCount
        FROM crash_logs_raw
        WHERE ${whereSql}
      `),
      clickHouseService.query<Array<CrashLogRecord>[number]>(`
        SELECT *
        FROM crash_logs_raw
        WHERE ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `)
    ]);

    return {
      instances: rows.map((r) => this.mapCrashRow(r)),
      totalCount: Number(countRows[0]?.totalCount || 0),
      limit,
      offset,
    };
  }

  private async getErrorInstancesFromPostgres(
    gameId: string,
    message: string | undefined,
    exceptionType: string | undefined,
    filters: HealthFilters & { limit?: number; offset?: number }
  ) {
    const { startDate, endDate, platform, country, appVersion, limit = 50, offset = 0 } = filters;

    const where: any = {
      gameId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (platform) where.platform = platform;
    if (country) where.country = country;
    if (appVersion) where.appVersion = appVersion;
    if (message) where.message = message;
    if (exceptionType) where.exceptionType = exceptionType;

    const totalCount = await this.prismaClient.crashLog.count({ where });
    const instances = await this.prismaClient.crashLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    return {
      instances,
      totalCount,
      limit,
      offset,
    };
  }

  async getCrashLogs(
    gameId: string,
    filters: HealthFilters & {
      severity?: string;
      crashType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    if (this.readFromClickHouse()) {
      if (this.isClickHouseStrict() && !clickHouseService.isEnabled()) {
        throw new Error('ClickHouse strict mode enabled for crash logs, but ClickHouse is not configured/enabled in API env');
      }
      if (clickHouseService.isEnabled()) {
        try {
          return await this.getCrashLogsFromClickHouse(gameId, filters);
        } catch (error) {
          if (this.isClickHouseStrict()) throw error;
          logger.warn('[Health] ClickHouse crash logs read failed; falling back to Postgres', {
            gameId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return this.getCrashLogsFromPostgres(gameId, filters);
  }

  private async getCrashLogsFromClickHouse(
    gameId: string,
    filters: HealthFilters & {
      severity?: string;
      crashType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const { severity, crashType, limit = 50, offset = 0 } = filters;
    const conditions = [this.chCrashWhere(gameId, filters)];
    if (severity) conditions.push(`severity = ${this.quote(severity)}`);
    if (crashType) conditions.push(`crashType = ${this.quote(crashType)}`);
    const whereSql = conditions.join(' AND ');

    const [countRows, rows] = await Promise.all([
      clickHouseService.query<Array<{ total: number }>[number]>(`
        SELECT toInt64(count()) AS total
        FROM crash_logs_raw
        WHERE ${whereSql}
      `),
      clickHouseService.query<Array<CrashLogRecord>[number]>(`
        SELECT *
        FROM crash_logs_raw
        WHERE ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `)
    ]);

    const total = Number(countRows[0]?.total || 0);
    return {
      logs: rows.map((r) => this.mapCrashRow(r)),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  private async getCrashLogsFromPostgres(
    gameId: string,
    filters: HealthFilters & {
      severity?: string;
      crashType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const { startDate, endDate, platform, country, appVersion, severity, crashType, limit = 50, offset = 0 } = filters;

    const where: any = {
      gameId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (platform) where.platform = platform;
    if (country) where.country = country;
    if (appVersion) where.appVersion = appVersion;
    if (severity) where.severity = severity;
    if (crashType) where.crashType = crashType;

    const [logs, total] = await Promise.all([
      this.prismaClient.crashLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prismaClient.crashLog.count({ where }),
    ]);

    return {
      logs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async reportCrash(data: {
    gameId: string;
    userId?: string;
    sessionId?: string;
    crashType: string;
    severity: string;
    message: string;
    stackTrace: string;
    exceptionType?: string;
    platform?: string;
    osVersion?: string;
    manufacturer?: string;
    device?: string;
    deviceId?: string;
    appVersion?: string;
    appBuild?: string;
    sdkVersion?: string;
    connectionType?: string;
    memoryUsage?: number;
    batteryLevel?: number;
    diskSpace?: number;
    breadcrumbs?: any;
    customData?: any;
  }) {
    return this.prismaClient.crashLog.create({
      data: {
        gameId: data.gameId,
        userId: data.userId || null,
        sessionId: data.sessionId || null,
        crashType: data.crashType,
        severity: data.severity as any,
        message: data.message,
        stackTrace: data.stackTrace,
        exceptionType: data.exceptionType || null,
        platform: data.platform || null,
        osVersion: data.osVersion || null,
        manufacturer: data.manufacturer || null,
        device: data.device || null,
        deviceId: data.deviceId || null,
        appVersion: data.appVersion || null,
        appBuild: data.appBuild || null,
        sdkVersion: data.sdkVersion || null,
        connectionType: data.connectionType || null,
        memoryUsage: data.memoryUsage || null,
        batteryLevel: data.batteryLevel || null,
        diskSpace: data.diskSpace || null,
        ...(data.breadcrumbs && { breadcrumbs: JSON.stringify(data.breadcrumbs) }),
        ...(data.customData && { customData: JSON.stringify(data.customData) }),
      },
    });
  }
}
