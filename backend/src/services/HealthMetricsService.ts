import { PrismaClient } from '@prisma/client';
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
          (SELECT count() FROM sessions_raw WHERE ${sessionWhere}) AS totalSessions,
          (SELECT uniqExact(userId) FROM sessions_raw WHERE ${sessionWhere}) AS totalUsers,
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
          ifNull(exceptionType, 'Unknown') AS exceptionType,
          toInt64(count()) AS cnt,
          toInt64(uniqExactIf(userId, userId IS NOT NULL AND userId != '')) AS affectedUsers,
          max(timestamp) AS lastOccurrence
        FROM crash_logs_raw
        WHERE ${crashWhere}
        GROUP BY message, ifNull(exceptionType, 'Unknown')
        ORDER BY cnt DESC
        LIMIT ${crashesLimit}
        OFFSET ${crashesOffset}
      `),
      clickHouseService.query<Array<{ totalCrashGroups: number }>[number]>(`
        SELECT toInt64(count()) AS totalCrashGroups
        FROM (
          SELECT message, ifNull(exceptionType, 'Unknown')
          FROM crash_logs_raw
          WHERE ${crashWhere}
          GROUP BY message, ifNull(exceptionType, 'Unknown')
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

    const crashWhere: any = {
      gameId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (platform) crashWhere.platform = platform;
    if (country) crashWhere.country = country;
    if (appVersion) crashWhere.appVersion = appVersion;

    const totalCrashes = await this.prismaClient.crashLog.count({ where: crashWhere });

    const sessionWhere: any = {
      gameId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    };
    if (platform) sessionWhere.platform = platform;
    if (appVersion) sessionWhere.version = appVersion;

    const totalSessions = await this.prismaClient.session.count({ where: sessionWhere });

    const activeUsersInPeriod = await this.prismaClient.session.findMany({
      where: sessionWhere,
      select: { userId: true },
      distinct: ['userId'],
    });
    const totalUsers = activeUsersInPeriod.length;

    const crashedUserIds = await this.prismaClient.crashLog.findMany({
      where: {
        ...crashWhere,
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const affectedUsers = crashedUserIds.length;

    const sessionsWithCrashIds = await this.prismaClient.crashLog.findMany({
      where: {
        ...crashWhere,
        sessionId: { not: null },
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    const sessionsWithCrashes = sessionsWithCrashIds.length;

    const crashRate = totalSessions > 0 ? (sessionsWithCrashes / totalSessions) * 100 : 0;
    const crashFreeUserRate = totalUsers > 0 ? ((totalUsers - affectedUsers) / totalUsers) * 100 : 100;
    const crashFreeSessionRate = totalSessions > 0 ? ((totalSessions - sessionsWithCrashes) / totalSessions) * 100 : 100;

    const crashesByType = await this.prismaClient.crashLog.groupBy({
      by: ['crashType'],
      where: crashWhere,
      _count: true,
    });

    const crashesBySeverity = await this.prismaClient.crashLog.groupBy({
      by: ['severity'],
      where: crashWhere,
      _count: true,
    });

    const allCrashes = await this.prismaClient.crashLog.findMany({
      where: crashWhere,
      select: {
        id: true,
        message: true,
        exceptionType: true,
        userId: true,
        timestamp: true,
      },
    });

    const crashGroups = new Map<string, {
      id: string;
      message: string;
      exceptionType: string;
      count: number;
      users: Set<string>;
      lastOccurrence: Date;
    }>();

    allCrashes.forEach((crash) => {
      const key = `${crash.message}::${crash.exceptionType}`;
      if (!crashGroups.has(key)) {
        crashGroups.set(key, {
          id: crash.id,
          message: crash.message,
          exceptionType: crash.exceptionType || 'Unknown',
          count: 0,
          users: new Set(),
          lastOccurrence: crash.timestamp,
        });
      }
      const group = crashGroups.get(key)!;
      group.count++;
      if (crash.userId) group.users.add(crash.userId);
      if (crash.timestamp > group.lastOccurrence) {
        group.lastOccurrence = crash.timestamp;
      }
    });

    const sortedCrashGroups = Array.from(crashGroups.values()).sort((a, b) => b.count - a.count);

    const totalCrashGroups = sortedCrashGroups.length;
    const topCrashes = sortedCrashGroups
      .slice(crashesOffset, crashesOffset + crashesLimit)
      .map((c) => ({
        id: c.id,
        message: c.message,
        exceptionType: c.exceptionType,
        count: c.count,
        affectedUsers: c.users.size,
        lastOccurrence: c.lastOccurrence,
      }));

    return {
      totalCrashes,
      crashRate: Number(crashRate.toFixed(2)),
      crashFreeUserRate: Number(crashFreeUserRate.toFixed(2)),
      crashFreeSessionRate: Number(crashFreeSessionRate.toFixed(2)),
      affectedUsers,
      totalUsers,
      crashesByType: crashesByType.map((c) => ({
        type: c.crashType,
        count: c._count,
      })),
      crashesBySeverity: crashesBySeverity.map((c) => ({
        severity: c.severity,
        count: c._count,
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
        FROM sessions_raw
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

    const crashWhere: any = {
      gameId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (platform) crashWhere.platform = platform;
    if (country) crashWhere.country = country;
    if (appVersion) crashWhere.appVersion = appVersion;

    const crashes = await this.prismaClient.crashLog.findMany({
      where: crashWhere,
      select: {
        timestamp: true,
        userId: true,
      },
    });

    const sessionWhere: any = {
      gameId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    };
    if (platform) sessionWhere.platform = platform;
    if (appVersion) sessionWhere.version = appVersion;

    const sessions = await this.prismaClient.session.findMany({
      where: sessionWhere,
      select: {
        startTime: true,
        userId: true,
      },
    });

    const crashesByDate = new Map<string, { count: number; users: Set<string> }>();
    crashes.forEach((crash) => {
      const dateStr = crash.timestamp.toISOString().split('T')[0];
      if (!dateStr) return;
      if (!crashesByDate.has(dateStr)) {
        crashesByDate.set(dateStr, { count: 0, users: new Set() });
      }
      const data = crashesByDate.get(dateStr)!;
      data.count++;
      if (crash.userId) data.users.add(crash.userId);
    });

    const usersByDate = new Map<string, Set<string>>();
    sessions.forEach((session) => {
      const dateStr = session.startTime.toISOString().split('T')[0];
      if (!dateStr) return;
      if (!usersByDate.has(dateStr)) {
        usersByDate.set(dateStr, new Set());
      }
      usersByDate.get(dateStr)!.add(session.userId);
    });

    const timeline: CrashTimeline[] = [];
    const allDates = new Set([...crashesByDate.keys(), ...usersByDate.keys()]);

    allDates.forEach((dateStr) => {
      const crashData = crashesByDate.get(dateStr) || { count: 0, users: new Set() };
      const totalUsers = usersByDate.get(dateStr)?.size || 0;
      const crashRate = totalUsers > 0 ? (crashData.count / totalUsers) * 100 : 0;

      timeline.push({
        date: dateStr,
        crashes: crashData.count,
        affectedUsers: crashData.users.size,
        totalUsers,
        crashRate: Number(crashRate.toFixed(2)),
      });
    });

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
