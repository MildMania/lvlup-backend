import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
}

export interface CrashTimeline {
  date: string;
  crashes: number;
  affectedUsers: number;
  totalUsers: number;
  crashRate: number;
}

export class HealthMetricsService {
  async getCrashMetrics(gameId: string, filters: HealthFilters): Promise<CrashMetrics> {
    const { startDate, endDate, platform, country, appVersion } = filters;

    // Build where clause for crash logs
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

    // Get total crashes
    const totalCrashes = await prisma.crashLog.count({
      where: crashWhere,
    });

    // Get unique users who experienced crashes
    const crashedUsers = await prisma.crashLog.findMany({
      where: crashWhere,
      select: { userId: true },
      distinct: ['userId'],
    });
    const affectedUsers = crashedUsers.filter(u => u.userId).length;

    // Get total users in period
    const userWhere: any = {
      gameId,
      createdAt: {
        lte: endDate,
      },
    };

    const totalUsers = await prisma.user.count({
      where: userWhere,
    });

    // Get total sessions in period
    const sessionWhere: any = {
      gameId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    };
    if (platform) sessionWhere.platform = platform;
    if (appVersion) sessionWhere.version = appVersion;

    const totalSessions = await prisma.session.count({
      where: sessionWhere,
    });

    // Get sessions with crashes
    const crashedSessions = await prisma.crashLog.findMany({
      where: crashWhere,
      select: { sessionId: true },
      distinct: ['sessionId'],
    });
    const sessionsWithCrashes = crashedSessions.filter(s => s.sessionId).length;

    // Calculate rates
    const crashRate = totalSessions > 0 ? (totalCrashes / totalSessions) * 100 : 0;
    const crashFreeUserRate = totalUsers > 0 ? ((totalUsers - affectedUsers) / totalUsers) * 100 : 100;
    const crashFreeSessionRate = totalSessions > 0 ? ((totalSessions - sessionsWithCrashes) / totalSessions) * 100 : 100;

    // Get crashes by type
    const crashesByType = await prisma.crashLog.groupBy({
      by: ['crashType'],
      where: crashWhere,
      _count: true,
    });

    // Get crashes by severity
    const crashesBySeverity = await prisma.crashLog.groupBy({
      by: ['severity'],
      where: crashWhere,
      _count: true,
    });

    // Get top crashes - group by message and exception type
    const allCrashes = await prisma.crashLog.findMany({
      where: crashWhere,
      select: {
        id: true,
        message: true,
        exceptionType: true,
        userId: true,
        timestamp: true,
      },
    });

    // Group crashes manually in JavaScript
    const crashGroups = new Map<string, {
      id: string;
      message: string;
      exceptionType: string;
      count: number;
      users: Set<string>;
      lastOccurrence: Date;
    }>();

    allCrashes.forEach(crash => {
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

    // Convert to array and sort by count
    const topCrashes = Array.from(crashGroups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(c => ({
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
      crashesByType: crashesByType.map(c => ({
        type: c.crashType,
        count: c._count,
      })),
      crashesBySeverity: crashesBySeverity.map(c => ({
        severity: c.severity,
        count: c._count,
      })),
      topCrashes,
    };
  }

  async getCrashTimeline(gameId: string, filters: HealthFilters): Promise<CrashTimeline[]> {
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

    // Get all crashes in the period
    const crashes = await prisma.crashLog.findMany({
      where: crashWhere,
      select: {
        timestamp: true,
        userId: true,
      },
    });

    // Get all sessions in the period
    const sessionWhere: any = {
      gameId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    };
    if (platform) sessionWhere.platform = platform;
    if (appVersion) sessionWhere.version = appVersion;

    const sessions = await prisma.session.findMany({
      where: sessionWhere,
      select: {
        startTime: true,
        userId: true,
      },
    });

    // Group crashes by date
    const crashesByDate = new Map<string, { count: number; users: Set<string> }>();
    crashes.forEach(crash => {
      const dateStr = crash.timestamp.toISOString().split('T')[0];
      if (!dateStr) return;
      if (!crashesByDate.has(dateStr)) {
        crashesByDate.set(dateStr, { count: 0, users: new Set() });
      }
      const data = crashesByDate.get(dateStr)!;
      data.count++;
      if (crash.userId) data.users.add(crash.userId);
    });

    // Group sessions by date
    const usersByDate = new Map<string, Set<string>>();
    sessions.forEach(session => {
      const dateStr = session.startTime.toISOString().split('T')[0];
      if (!dateStr) return;
      if (!usersByDate.has(dateStr)) {
        usersByDate.set(dateStr, new Set());
      }
      usersByDate.get(dateStr)!.add(session.userId);
    });

    // Create timeline data
    const timeline: CrashTimeline[] = [];
    const allDates = new Set([...crashesByDate.keys(), ...usersByDate.keys()]);
    
    allDates.forEach(dateStr => {
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

    // Sort by date
    return timeline.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getCrashDetails(crashId: string) {
    return prisma.crashLog.findUnique({
      where: { id: crashId },
    });
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
      prisma.crashLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.crashLog.count({ where }),
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
    bundleId?: string;
    engineVersion?: string;
    sdkVersion?: string;
    country?: string;
    connectionType?: string;
    memoryUsage?: number;
    batteryLevel?: number;
    diskSpace?: number;
    breadcrumbs?: any;
    customData?: any;
  }) {
    return prisma.crashLog.create({
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
        bundleId: data.bundleId || null,
        engineVersion: data.engineVersion || null,
        sdkVersion: data.sdkVersion || null,
        country: data.country || null,
        connectionType: data.connectionType || null,
        memoryUsage: data.memoryUsage || null,
        batteryLevel: data.batteryLevel || null,
        diskSpace: data.diskSpace || null,
        breadcrumbs: data.breadcrumbs ? JSON.stringify(data.breadcrumbs) : undefined,
        customData: data.customData ? JSON.stringify(data.customData) : undefined,
      },
    });
  }
}

