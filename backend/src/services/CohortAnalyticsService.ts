import { PrismaClient, Prisma } from '@prisma/client';
import prismaInstance from '../prisma';

// Cohort data for a specific install date
export interface CohortData {
    installDate: string;
    installCount: number;
    retentionByDay: { [day: number]: number }; // day -> retention percentage
    userCountByDay: { [day: number]: number }; // day -> absolute user count
}

// Cohort analytics parameters
export interface CohortAnalyticsParams {
    country?: string | string[];
    platform?: string | string[];
    version?: string | string[];
    abTestGroup?: string;
    days?: number[]; // Array of days to calculate retention for (e.g., [0, 1, 3, 7, 14, 30])
}

/**
 * Service for cohort-based analytics
 */
export class CohortAnalyticsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prismaInstance;
    }

    /**
     * Calculate cohort retention table
     * @param gameId The game ID
     * @param startDate Start date for cohorts (first install date)
     * @param endDate End date for cohorts (last install date)
     * @param filters Optional filters (platform, country, version, etc.)
     */
    async calculateCohortRetention(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            // Default retention days if not specified
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortRetentionFromRollups(gameId, startDate, endDate, retentionDays, filters);
        } catch (error) {
            console.error('Error calculating cohort retention:', error);
            throw new Error('Failed to calculate cohort retention');
        }
    }

    /**
     * Close database connection
     */
    async disconnect() {
        await this.prisma.$disconnect();
    }

    /**
     * Calculate cohort playtime metrics (average daily playtime per cohort)
     */
    async calculateCohortPlaytime(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortSessionMetricsFromRollups(gameId, startDate, endDate, retentionDays, 'playtime', filters);
        } catch (error) {
            console.error('Error calculating cohort playtime:', error);
            throw new Error('Failed to calculate cohort playtime');
        }
    }

    /**
     * Calculate cohort session count metrics (average sessions per user per day)
     */
    async calculateCohortSessionCount(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortSessionMetricsFromRollups(gameId, startDate, endDate, retentionDays, 'session-count', filters);
        } catch (error) {
            console.error('Error calculating cohort session count:', error);
            throw new Error('Failed to calculate cohort session count');
        }
    }

    /**
     * Calculate cohort session length metrics (average session duration per day)
     */
    async calculateCohortSessionLength(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortSessionMetricsFromRollups(gameId, startDate, endDate, retentionDays, 'session-length', filters);
        } catch (error) {
            console.error('Error calculating cohort session length:', error);
            throw new Error('Failed to calculate cohort session length');
        }
    }

    private async getCohortRetentionFromRollups(
        gameId: string,
        startDate: Date,
        endDate: Date,
        days: number[],
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        const platformFilter = this.normalizeFilter(filters?.platform);
        const countryFilter = this.normalizeFilter(filters?.country);
        const versionFilter = this.normalizeFilter(filters?.version);

        const rows = await this.prisma.$queryRaw<
            Array<{ installDate: Date; dayIndex: number; cohortSize: bigint; retainedUsers: bigint; retainedLevelCompletes: bigint }>
        >(Prisma.sql`
            SELECT
                "installDate" AS "installDate",
                "dayIndex" AS "dayIndex",
                COALESCE(SUM("cohortSize"), 0)::bigint AS "cohortSize",
                COALESCE(SUM("retainedUsers"), 0)::bigint AS "retainedUsers",
                COALESCE(SUM("retainedLevelCompletes"), 0)::bigint AS "retainedLevelCompletes"
            FROM "cohort_retention_daily"
            WHERE "gameId" = ${gameId}
              AND "installDate" >= ${startDate}
              AND "installDate" <= ${endDate}
              AND "dayIndex" IN (${Prisma.join(days)})
              ${platformFilter.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platformFilter)})` : Prisma.sql``}
              ${countryFilter.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countryFilter)})` : Prisma.sql``}
              ${versionFilter.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versionFilter)})` : Prisma.sql``}
            GROUP BY "installDate","dayIndex"
        `);

        const normalized = rows.map((row) => ({
            installDate: row.installDate,
            dayIndex: row.dayIndex,
            cohortSize: Number(row.cohortSize || 0),
            retainedUsers: Number(row.retainedUsers || 0),
            retainedLevelCompletes: Number(row.retainedLevelCompletes || 0)
        }));

        return this.buildCohortDataFromRollups(normalized, days, (row) => ({
            value: row.cohortSize > 0 ? (row.retainedUsers / row.cohortSize) * 100 : 0,
            userCount: row.retainedUsers
        }));
    }

    private async getCohortSessionMetricsFromRollups(
        gameId: string,
        startDate: Date,
        endDate: Date,
        days: number[],
        metric: 'playtime' | 'session-count' | 'session-length',
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        const platformFilter = this.normalizeFilter(filters?.platform);
        const countryFilter = this.normalizeFilter(filters?.country);
        const versionFilter = this.normalizeFilter(filters?.version);

        const rows = await this.prisma.$queryRaw<
            Array<{ installDate: Date; dayIndex: number; cohortSize: bigint; sessionUsers: bigint; totalSessions: bigint; totalDurationSec: bigint }>
        >(Prisma.sql`
            SELECT
                "installDate" AS "installDate",
                "dayIndex" AS "dayIndex",
                COALESCE(SUM("cohortSize"), 0)::bigint AS "cohortSize",
                COALESCE(SUM("sessionUsers"), 0)::bigint AS "sessionUsers",
                COALESCE(SUM("totalSessions"), 0)::bigint AS "totalSessions",
                COALESCE(SUM("totalDurationSec"), 0)::bigint AS "totalDurationSec"
            FROM "cohort_session_metrics_daily"
            WHERE "gameId" = ${gameId}
              AND "installDate" >= ${startDate}
              AND "installDate" <= ${endDate}
              AND "dayIndex" IN (${Prisma.join(days)})
              ${platformFilter.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platformFilter)})` : Prisma.sql``}
              ${countryFilter.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countryFilter)})` : Prisma.sql``}
              ${versionFilter.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versionFilter)})` : Prisma.sql``}
            GROUP BY "installDate","dayIndex"
        `);

        const normalized = rows.map((row) => ({
            installDate: row.installDate,
            dayIndex: row.dayIndex,
            cohortSize: Number(row.cohortSize || 0),
            sessionUsers: Number(row.sessionUsers || 0),
            totalSessions: Number(row.totalSessions || 0),
            totalDurationSec: Number(row.totalDurationSec || 0)
        }));

        return this.buildCohortDataFromRollups(normalized, days, (row) => {
            const sessionUsers = row.sessionUsers;
            const totalSessions = row.totalSessions;
            const totalDurationSec = row.totalDurationSec;

            if (metric === 'playtime') {
                const avgMinutes = sessionUsers > 0 ? (totalDurationSec / sessionUsers) / 60 : 0;
                return { value: Math.round(avgMinutes * 10) / 10, userCount: sessionUsers };
            }

            if (metric === 'session-count') {
                const avgSessions = sessionUsers > 0 ? totalSessions / sessionUsers : 0;
                return { value: Math.round(avgSessions * 100) / 100, userCount: sessionUsers };
            }

            const avgLengthMin = totalSessions > 0 ? (totalDurationSec / totalSessions) / 60 : 0;
            return { value: Math.round(avgLengthMin * 10) / 10, userCount: sessionUsers };
        });
    }

    private async getCohortAvgCompletedFromRollups(
        gameId: string,
        startDate: Date,
        endDate: Date,
        days: number[],
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        const rows = await this.getRetentionRowsForRollups(gameId, startDate, endDate, days, filters);
        const byInstall = new Map<string, Map<number, typeof rows[number]>>();
        for (const row of rows) {
            const key = row.installDate.toISOString().split('T')[0];
            if (!key) continue;
            if (!byInstall.has(key)) byInstall.set(key, new Map());
            byInstall.get(key)!.set(row.dayIndex, row);
        }

        const now = new Date();
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const result: CohortData[] = [];

        for (const [installDate, dayMap] of byInstall.entries()) {
            const installDateObj = new Date(installDate + 'T00:00:00.000Z');
            const retentionByDay: { [day: number]: number } = {};
            const userCountByDay: { [day: number]: number } = {};
            const cohortSize = Number(dayMap.values().next().value?.cohortSize || 0);

            for (const day of days) {
                const target = new Date(installDateObj);
                target.setUTCDate(target.getUTCDate() + day);
                const targetStart = new Date(target);
                targetStart.setUTCHours(0, 0, 0, 0);
                if (targetStart > now) {
                    retentionByDay[day] = -1;
                    userCountByDay[day] = 0;
                    continue;
                }

                const row = dayMap.get(day);
                const retainedUsers = Number(row?.retainedUsers || 0);
                const completes = Number(row?.retainedLevelCompletes || 0);
                const avg = retainedUsers > 0 ? completes / retainedUsers : 0;

                retentionByDay[day] = Math.round(avg * 10) / 10;
                userCountByDay[day] = retainedUsers;
            }

            result.push({
                installDate,
                installCount: cohortSize,
                retentionByDay,
                userCountByDay
            });
        }

        result.sort((a, b) => a.installDate.localeCompare(b.installDate));
        return result;
    }

    private async getCohortAvgReachedFromRollups(
        gameId: string,
        startDate: Date,
        endDate: Date,
        days: number[],
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        const rows = await this.getRetentionRowsForRollups(gameId, startDate, endDate, days, filters);
        const byInstall = new Map<string, Map<number, typeof rows[number]>>();
        for (const row of rows) {
            const key = row.installDate.toISOString().split('T')[0];
            if (!key) continue;
            if (!byInstall.has(key)) byInstall.set(key, new Map());
            byInstall.get(key)!.set(row.dayIndex, row);
        }

        const now = new Date();
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const result: CohortData[] = [];

        for (const [installDate, dayMap] of byInstall.entries()) {
            const installDateObj = new Date(installDate + 'T00:00:00.000Z');
            const retentionByDay: { [day: number]: number } = {};
            const userCountByDay: { [day: number]: number } = {};
            const cohortSize = Number(dayMap.values().next().value?.cohortSize || 0);

            const dailyAvg: Record<number, number> = {};
            for (const day of days) {
                const target = new Date(installDateObj);
                target.setUTCDate(target.getUTCDate() + day);
                const targetStart = new Date(target);
                targetStart.setUTCHours(0, 0, 0, 0);
                if (targetStart > now) {
                    retentionByDay[day] = -1;
                    userCountByDay[day] = 0;
                    continue;
                }

                const row = dayMap.get(day);
                const retainedUsers = Number(row?.retainedUsers || 0);
                const completes = Number(row?.retainedLevelCompletes || 0);
                dailyAvg[day] = retainedUsers > 0 ? completes / retainedUsers : 0;

                let cumulative = 0;
                for (const d of days) {
                    if (d <= day && dailyAvg[d] !== undefined) {
                        cumulative += dailyAvg[d];
                    }
                }
                retentionByDay[day] = cumulative > 0 ? Math.round(cumulative * 10) / 10 : 0;
                userCountByDay[day] = retainedUsers;
            }

            result.push({
                installDate,
                installCount: cohortSize,
                retentionByDay,
                userCountByDay
            });
        }

        result.sort((a, b) => a.installDate.localeCompare(b.installDate));
        return result;
    }

    private async getRetentionRowsForRollups(
        gameId: string,
        startDate: Date,
        endDate: Date,
        days: number[],
        filters?: CohortAnalyticsParams
    ): Promise<Array<{ installDate: Date; dayIndex: number; cohortSize: number; retainedUsers: number; retainedLevelCompletes: number }>> {
        const platformFilter = this.normalizeFilter(filters?.platform);
        const countryFilter = this.normalizeFilter(filters?.country);
        const versionFilter = this.normalizeFilter(filters?.version);

        const rows = await this.prisma.$queryRaw<
            Array<{ installDate: Date; dayIndex: number; cohortSize: bigint; retainedUsers: bigint; retainedLevelCompletes: bigint }>
        >(Prisma.sql`
            SELECT
                "installDate" AS "installDate",
                "dayIndex" AS "dayIndex",
                COALESCE(SUM("cohortSize"), 0)::bigint AS "cohortSize",
                COALESCE(SUM("retainedUsers"), 0)::bigint AS "retainedUsers",
                COALESCE(SUM("retainedLevelCompletes"), 0)::bigint AS "retainedLevelCompletes"
            FROM "cohort_retention_daily"
            WHERE "gameId" = ${gameId}
              AND "installDate" >= ${startDate}
              AND "installDate" <= ${endDate}
              AND "dayIndex" IN (${Prisma.join(days)})
              ${platformFilter.length ? Prisma.sql`AND "platform" IN (${Prisma.join(platformFilter)})` : Prisma.sql``}
              ${countryFilter.length ? Prisma.sql`AND "countryCode" IN (${Prisma.join(countryFilter)})` : Prisma.sql``}
              ${versionFilter.length ? Prisma.sql`AND "appVersion" IN (${Prisma.join(versionFilter)})` : Prisma.sql``}
            GROUP BY "installDate","dayIndex"
        `);
        return rows.map((row) => ({
            installDate: row.installDate,
            dayIndex: row.dayIndex,
            cohortSize: Number(row.cohortSize || 0),
            retainedUsers: Number(row.retainedUsers || 0),
            retainedLevelCompletes: Number(row.retainedLevelCompletes || 0)
        }));
    }

    private buildCohortDataFromRollups<T extends { installDate: Date; dayIndex: number; cohortSize: number }>(
        rows: T[],
        days: number[],
        mapper: (row: T) => { value: number; userCount: number }
    ): CohortData[] {
        const byInstall = new Map<string, Map<number, T>>();
        for (const row of rows) {
            const key = row.installDate.toISOString().split('T')[0];
            if (!key) continue;
            if (!byInstall.has(key)) byInstall.set(key, new Map());
            byInstall.get(key)!.set(row.dayIndex, row);
        }

        const now = new Date();
        const result: CohortData[] = [];

        for (const [installDate, dayMap] of byInstall.entries()) {
            const installDateObj = new Date(installDate + 'T00:00:00.000Z');
            const retentionByDay: { [day: number]: number } = {};
            const userCountByDay: { [day: number]: number } = {};

            const cohortSize = dayMap.values().next().value?.cohortSize || 0;

            for (const day of days) {
                const targetDate = new Date(installDateObj);
                targetDate.setUTCDate(targetDate.getUTCDate() + day);
                const targetStart = new Date(targetDate);
                targetStart.setUTCHours(0, 0, 0, 0);

                if (targetStart > now) {
                    retentionByDay[day] = -1;
                    userCountByDay[day] = 0;
                    continue;
                }

                const row = dayMap.get(day);
                if (!row) {
                    retentionByDay[day] = 0;
                    userCountByDay[day] = 0;
                    continue;
                }

                const mapped = mapper(row);
                retentionByDay[day] = mapped.value;
                userCountByDay[day] = mapped.userCount;
            }

            const installCount = cohortSize;

            result.push({
                installDate,
                installCount,
                retentionByDay,
                userCountByDay
            });
        }

        result.sort((a, b) => a.installDate.localeCompare(b.installDate));
        return result;
    }

    private normalizeFilter(value?: string | string[]): string[] {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter((v) => v && v !== 'All');
        return value.split(',').map((v) => v.trim()).filter((v) => v && v !== 'All');
    }

    /**
     * Calculate average completed level count per user by cohort
     */
    async calculateAvgCompletedLevels(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortAvgCompletedFromRollups(gameId, startDate, endDate, retentionDays, filters);
        } catch (error) {
            console.error('Error calculating average completed levels:', error);
            throw new Error('Failed to calculate average completed levels');
        }
    }


    /**
     * Calculate average reached level (highest level completed) per user by cohort
     */
    async calculateAvgReachedLevel(
        gameId: string,
        startDate: Date,
        endDate: Date,
        filters?: CohortAnalyticsParams
    ): Promise<CohortData[]> {
        try {
            const retentionDays = filters?.days || [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
            return this.getCohortAvgReachedFromRollups(gameId, startDate, endDate, retentionDays, filters);
        } catch (error) {
            console.error('Error calculating average reached level:', error);
            throw new Error('Failed to calculate average reached level');
        }
    }

}
