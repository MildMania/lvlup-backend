import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { AnalyticsFilterParams } from '../types/api';
import { cache, generateCacheKey } from '../utils/simpleCache';
import prisma from '../prisma';
import { HLL } from '../utils/hll';

export interface RetentionData {
    day: number;
    count: number;
    percentage: number;
}

export interface ActiveUserData {
    date: string;
    dau: number; // Daily Active Users
    wau: number; // Weekly Active Users
    mau: number; // Monthly Active Users
}

export interface PlaytimeData {
    date: string;
    avgSessionDuration: number; // in seconds
    totalPlaytime: number; // in seconds
    sessionsPerUser: number;
}

export class AnalyticsMetricsService {
    private prisma: PrismaClient;

    constructor(prismaClient?: PrismaClient) {
        this.prisma = prismaClient || prisma;
    }

    // Calculate retention metrics with flexible retention days and filters
    async calculateRetention(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<RetentionData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'retention',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (10 minute TTL for retention since it's expensive)
            const cached = cache.get<RetentionData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for retention: ${cacheKey}`);
                return cached;
            }

            const startTime = Date.now(); // Performance tracking
            logger.debug(`Cache miss for retention: ${cacheKey}, calculating...`);

            // Use custom retention days if provided, or default to standard days
            const retentionDays = filters?.retentionDays && filters.retentionDays.length > 0
                ? filters.retentionDays.sort((a, b) => a - b)  // Sort ascending
                : [1, 3, 7, 14, 30];

            const retentionPromises = retentionDays.map(async (day) => {
                const countries = filters?.country
                    ? (Array.isArray(filters.country) ? filters.country : [filters.country])
                    : [];
                const platforms = filters?.platform
                    ? (Array.isArray(filters.platform) ? filters.platform : [filters.platform])
                    : [];
                const versions = filters?.version
                    ? (Array.isArray(filters.version) ? filters.version : [filters.version])
                    : [];

                // Eligible users: users created in range whose Day N has passed
                const eligibleResult = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
                    SELECT COUNT(*) AS count
                    FROM "users" u
                    WHERE u."gameId" = ${gameId}
                      AND u."createdAt" >= ${startDate}
                      AND u."createdAt" <= ${endDate}
                      AND u."createdAt" + (${day} || ' days')::interval <= ${endDate}
                      ${platforms.length ? Prisma.sql`AND u."platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
                      ${versions.length ? Prisma.sql`AND u."version" IN (${Prisma.join(versions)})` : Prisma.sql``}
                      ${
                          countries.length
                              ? Prisma.sql`AND EXISTS (
                                    SELECT 1 FROM "events" e
                                    WHERE e."userId" = u."id"
                                      AND e."gameId" = ${gameId}
                                      AND e."countryCode" IN (${Prisma.join(countries)})
                                )`
                              : Prisma.sql``
                      }
                `);
                const eligibleUsersCount = Number(eligibleResult[0]?.count || 0);

                if (eligibleUsersCount === 0) {
                    return { day, count: 0, percentage: 0 };
                }

                // Retained users: users whose event day matches createdAt + N days
                const retainedResult = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
                    SELECT COUNT(DISTINCT e."userId") AS count
                    FROM "events" e
                    JOIN "users" u ON u."id" = e."userId"
                    WHERE u."gameId" = ${gameId}
                      AND u."createdAt" >= ${startDate}
                      AND u."createdAt" <= ${endDate}
                      AND e."gameId" = ${gameId}
                      AND e."timestamp" >= ${startDate}
                      AND e."timestamp" <= ${endDate}
                      AND date_trunc('day', e."timestamp") = date_trunc('day', u."createdAt") + (${day} || ' days')::interval
                      ${countries.length ? Prisma.sql`AND e."countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
                      ${platforms.length ? Prisma.sql`AND u."platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
                      ${versions.length ? Prisma.sql`AND u."version" IN (${Prisma.join(versions)})` : Prisma.sql``}
                `);
                const retainedCount = Number(retainedResult[0]?.count || 0);

                const percentage = eligibleUsersCount > 0 ? (retainedCount / eligibleUsersCount) * 100 : 0;

                return {
                    day,
                    count: retainedCount,
                    percentage: Math.round(percentage * 100) / 100
                };
            });

            // Execute all retention day calculations in parallel
            const retentionData = await Promise.all(retentionPromises);
            const sortedData = retentionData.sort((a, b) => a.day - b.day);

            // Cache for 30 minutes (1800 seconds) - retention doesn't need real-time updates
            cache.set(cacheKey, sortedData, 1800);

            const duration = Date.now() - startTime;
            logger.info(`Calculated retention metrics for game ${gameId} in ${duration}ms`);
            return sortedData;
        } catch (error) {
            logger.error('Error calculating retention:', error);
            throw error;
        }
    }

    // Calculate daily, weekly, monthly active users with filters
    async calculateActiveUsers(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<ActiveUserData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'activeUsers',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (5 minute TTL)
            const cached = cache.get<ActiveUserData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for active users: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for active users: ${cacheKey}, calculating...`);

            const countries = filters?.country
                ? (Array.isArray(filters.country) ? filters.country : [filters.country])
                : [];
            const platforms = filters?.platform
                ? (Array.isArray(filters.platform) ? filters.platform : [filters.platform])
                : [];
            const versions = filters?.version
                ? (Array.isArray(filters.version) ? filters.version : [filters.version])
                : [];

            const days: Date[] = [];
            const cursor = new Date(startDate);
            cursor.setUTCHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setUTCHours(0, 0, 0, 0);
            while (cursor <= end) {
                days.push(new Date(cursor));
                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }

            const dauRows = await this.prisma.$queryRaw<
                Array<{ day: Date; dau: bigint }>
            >(Prisma.sql`
                SELECT
                    date_trunc('day', "date") AS "day",
                    COALESCE(SUM("dau"), 0) AS "dau"
                FROM "active_users_daily"
                WHERE "gameId" = ${gameId}
                  AND "date" >= ${startDate}
                  AND "date" <= ${endDate}
                  ${countries.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
                  ${platforms.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
                  ${versions.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versions)})` : Prisma.sql``}
                GROUP BY 1
            `);

            const hllStart = new Date(startDate);
            hllStart.setUTCDate(hllStart.getUTCDate() - 29);

            const hllRows = await this.prisma.$queryRaw<
                Array<{ day: Date; hll: Buffer }>
            >(Prisma.sql`
                SELECT
                    date_trunc('day', "date") AS "day",
                    "hll" AS "hll"
                FROM "active_users_hll_daily"
                WHERE "gameId" = ${gameId}
                  AND "date" >= ${hllStart}
                  AND "date" <= ${endDate}
                  ${countries.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countries)})` : Prisma.sql``}
                  ${platforms.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
                  ${versions.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versions)})` : Prisma.sql``}
            `);

            const dauByDay = new Map<string, number>();
            for (const row of dauRows) {
                const key = row.day.toISOString().split('T')[0] || '';
                dauByDay.set(key, Number(row.dau || 0));
            }

            const hllByDay = new Map<string, HLL>();
            for (const row of hllRows) {
                const key = row.day.toISOString().split('T')[0] || '';
                const existing = hllByDay.get(key);
                const current = HLL.fromBuffer(row.hll);
                if (existing) {
                    existing.union(current);
                } else {
                    hllByDay.set(key, current);
                }
            }

            const dailyData: ActiveUserData[] = days.map((day) => {
                const key = day.toISOString().split('T')[0] || '';
                const dau = dauByDay.get(key) || 0;

                const wauHll = new HLL();
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(day);
                    d.setUTCDate(d.getUTCDate() - i);
                    const k = d.toISOString().split('T')[0] || '';
                    const hll = hllByDay.get(k);
                    if (hll) wauHll.union(hll);
                }

                const mauHll = new HLL();
                for (let i = 29; i >= 0; i--) {
                    const d = new Date(day);
                    d.setUTCDate(d.getUTCDate() - i);
                    const k = d.toISOString().split('T')[0] || '';
                    const hll = hllByDay.get(k);
                    if (hll) mauHll.union(hll);
                }

                return {
                    date: key,
                    dau,
                    wau: wauHll.count(),
                    mau: mauHll.count()
                };
            });

            // Cache for 5 minutes (300 seconds)
            cache.set(cacheKey, dailyData, 300);

            logger.info(`Calculated active user metrics for game ${gameId}`);
            return dailyData;
        } catch (error) {
            logger.error('Error calculating active users:', error);
            throw error;
        }
    }

    // Calculate daily playtime metrics with filters
    async calculatePlaytimeMetrics(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: AnalyticsFilterParams
    ): Promise<PlaytimeData[]> {
        try {
            // Generate cache key
            const cacheKey = generateCacheKey(
                'playtime',
                gameId,
                startDate.toISOString(),
                endDate.toISOString(),
                JSON.stringify(filters || {})
            );

            // Check cache first (5 minute TTL)
            const cached = cache.get<PlaytimeData[]>(cacheKey);
            if (cached) {
                logger.debug(`Cache hit for playtime: ${cacheKey}`);
                return cached;
            }

            logger.debug(`Cache miss for playtime: ${cacheKey}, calculating...`);

            const countries = filters?.country
                ? (Array.isArray(filters.country) ? filters.country : [filters.country])
                : [];
            const platforms = filters?.platform
                ? (Array.isArray(filters.platform) ? filters.platform : [filters.platform])
                : [];
            const versions = filters?.version
                ? (Array.isArray(filters.version) ? filters.version : [filters.version])
                : [];

            const rows = await this.prisma.$queryRaw<
                Array<{ day: Date; total_sessions: bigint; unique_users: bigint; total_duration: bigint }>
            >(Prisma.sql`
                WITH days AS (
                    SELECT generate_series(
                        date_trunc('day', ${startDate}::timestamptz),
                        date_trunc('day', ${endDate}::timestamptz),
                        interval '1 day'
                    ) AS day
                ),
                session_agg AS (
                    SELECT
                        date_trunc('day', s."startTime") AS day,
                        COUNT(*) AS total_sessions,
                        COUNT(DISTINCT s."userId") AS unique_users,
                        COALESCE(SUM(s."duration"), 0) AS total_duration
                    FROM "sessions" s
                    WHERE s."gameId" = ${gameId}
                      AND s."startTime" >= ${startDate}
                      AND s."startTime" <= ${endDate}
                      AND s."endTime" IS NOT NULL
                      AND s."duration" IS NOT NULL
                      AND s."duration" > 0
                      ${platforms.length ? Prisma.sql`AND s."platform" IN (${Prisma.join(platforms)})` : Prisma.sql``}
                      ${versions.length ? Prisma.sql`AND s."version" IN (${Prisma.join(versions)})` : Prisma.sql``}
                      ${
                          countries.length
                              ? Prisma.sql`AND EXISTS (
                                    SELECT 1 FROM "events" e
                                    WHERE e."sessionId" = s."id"
                                      AND e."countryCode" IN (${Prisma.join(countries)})
                                )`
                              : Prisma.sql``
                      }
                    GROUP BY date_trunc('day', s."startTime")
                )
                SELECT
                    d.day AS day,
                    COALESCE(sa.total_sessions, 0) AS total_sessions,
                    COALESCE(sa.unique_users, 0) AS unique_users,
                    COALESCE(sa.total_duration, 0) AS total_duration
                FROM days d
                LEFT JOIN session_agg sa ON sa.day = d.day
                ORDER BY d.day ASC
            `);

            const playtimeData: PlaytimeData[] = rows.map((row) => {
                const totalSessions = Number(row.total_sessions || 0);
                const uniqueUsers = Number(row.unique_users || 0);
                const totalDuration = Number(row.total_duration || 0);
                const avgSessionDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
                const sessionsPerUser = uniqueUsers > 0 ? totalSessions / uniqueUsers : 0;
                const totalPlaytime = uniqueUsers > 0 ? totalDuration / uniqueUsers : 0;

                return {
                    date: row.day.toISOString().split('T')[0] || '',
                    avgSessionDuration,
                    totalPlaytime,
                    sessionsPerUser
                };
            });

            logger.info(`Calculated playtime metrics for game ${gameId}`);
            // Cache for 5 minutes (300 seconds)
            cache.set(cacheKey, playtimeData, 300);
            return playtimeData;
        } catch (error) {
            logger.error('Error calculating playtime metrics:', error);
            throw error;
        }
    }
}
