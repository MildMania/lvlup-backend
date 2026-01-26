/**
 * Session Monitoring Queries
 * 
 * These queries help monitor session health and identify potential issues
 */

import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import prisma from '../prisma';

/**
 * Check for sessions where lastHeartbeat > endTime
 * This should ideally return 0 after the fix is applied
 */
export async function checkSessionsWithLateHeartbeats() {
    const sessions = await prisma.session.findMany({
        where: {
            endTime: { not: null },
            lastHeartbeat: { not: null },
        },
        select: {
            id: true,
            startTime: true,
            endTime: true,
            lastHeartbeat: true,
            duration: true,
            platform: true,
        }
    });

    const sessionsWithIssue = sessions.filter(
        session => session.lastHeartbeat! > session.endTime!
    );

    const sessionsWithIncorrectDuration = sessionsWithIssue.filter(session => {
        const correctDuration = Math.floor(
            (session.lastHeartbeat!.getTime() - session.startTime.getTime()) / 1000
        );
        return session.duration !== correctDuration;
    });

    return {
        total: sessions.length,
        withLateHeartbeats: sessionsWithIssue.length,
        withIncorrectDuration: sessionsWithIncorrectDuration.length,
        percentage: sessions.length > 0 
            ? ((sessionsWithIssue.length / sessions.length) * 100).toFixed(2)
            : '0',
        samples: sessionsWithIssue.slice(0, 5).map(s => ({
            id: s.id,
            platform: s.platform,
            duration: s.duration,
            correctDuration: Math.floor(
                (s.lastHeartbeat!.getTime() - s.startTime.getTime()) / 1000
            ),
            difference: Math.floor(
                (s.lastHeartbeat!.getTime() - s.startTime.getTime()) / 1000
            ) - (s.duration || 0)
        }))
    };
}

/**
 * Get session statistics for monitoring
 */
export async function getSessionStatistics() {
    const [
        totalSessions,
        sessionsWithHeartbeat,
        sessionsWithoutHeartbeat,
        avgDuration,
        activeSessions
    ] = await Promise.all([
        prisma.session.count(),
        prisma.session.count({
            where: { lastHeartbeat: { not: null } }
        }),
        prisma.session.count({
            where: { lastHeartbeat: null }
        }),
        prisma.session.aggregate({
            where: { duration: { not: null } },
            _avg: { duration: true }
        }),
        prisma.session.count({
            where: { endTime: null }
        })
    ]);

    return {
        totalSessions,
        sessionsWithHeartbeat,
        sessionsWithoutHeartbeat,
        avgDurationSeconds: Math.round(avgDuration._avg.duration || 0),
        avgDurationMinutes: Math.round((avgDuration._avg.duration || 0) / 60),
        activeSessions,
        closedSessions: totalSessions - activeSessions,
        heartbeatCoverage: totalSessions > 0
            ? ((sessionsWithHeartbeat / totalSessions) * 100).toFixed(2)
            : '0'
    };
}

/**
 * Get platform-wise session breakdown
 */
export async function getSessionsByPlatform() {
    const sessions = await prisma.session.groupBy({
        by: ['platform'],
        _count: { id: true },
        _avg: { duration: true },
        where: {
            platform: { not: null },
            duration: { not: null }
        }
    });

    return sessions.map(s => ({
        platform: s.platform,
        count: s._count.id,
        avgDurationSeconds: Math.round(s._avg.duration || 0),
        avgDurationMinutes: Math.round((s._avg.duration || 0) / 60)
    }));
}

/**
 * Check for anomalies in recent sessions
 */
export async function checkRecentSessionAnomalies(hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const recentSessions = await prisma.session.findMany({
        where: {
            startTime: { gte: since },
            endTime: { not: null }
        },
        select: {
            id: true,
            startTime: true,
            endTime: true,
            lastHeartbeat: true,
            duration: true,
            platform: true
        }
    });

    const anomalies = {
        veryShort: recentSessions.filter(s => (s.duration || 0) < 5).length, // < 5 seconds
        veryLong: recentSessions.filter(s => (s.duration || 0) > 7200).length, // > 2 hours
        noHeartbeat: recentSessions.filter(s => !s.lastHeartbeat).length,
        lateHeartbeat: recentSessions.filter(s => 
            s.lastHeartbeat && s.endTime && s.lastHeartbeat > s.endTime
        ).length,
        negativeDuration: recentSessions.filter(s => (s.duration || 0) < 0).length
    };

    return {
        totalRecentSessions: recentSessions.length,
        timeWindow: `Last ${hours} hours`,
        anomalies,
        healthScore: calculateHealthScore(recentSessions.length, anomalies)
    };
}

function calculateHealthScore(total: number, anomalies: any): string {
    if (total === 0) return '100%';
    
    const totalAnomalies = Object.values(anomalies).reduce(
        (sum: number, val) => sum + (val as number), 
        0
    ) as number;
    
    const healthScore = ((total - totalAnomalies) / total) * 100;
    return `${healthScore.toFixed(2)}%`;
}

/**
 * Run all monitoring checks
 */
export async function runSessionHealthCheck() {
    logger.info('Running session health check...');

    try {
        const [lateHeartbeats, statistics, byPlatform, anomalies] = await Promise.all([
            checkSessionsWithLateHeartbeats(),
            getSessionStatistics(),
            getSessionsByPlatform(),
            checkRecentSessionAnomalies(24)
        ]);

        const report = {
            timestamp: new Date().toISOString(),
            lateHeartbeats,
            statistics,
            byPlatform,
            anomalies,
            summary: {
                overallHealth: anomalies.healthScore,
                sessionsWithIssues: lateHeartbeats.withIncorrectDuration,
                totalSessions: statistics.totalSessions,
                avgSessionDuration: `${statistics.avgDurationMinutes} minutes`
            }
        };

        logger.info('Session health check complete', report.summary);
        return report;
    } catch (error) {
        logger.error('Error running session health check:', error);
        throw error;
    }
}

// Export for use in health endpoints
export const sessionMonitoring = {
    checkSessionsWithLateHeartbeats,
    getSessionStatistics,
    getSessionsByPlatform,
    checkRecentSessionAnomalies,
    runSessionHealthCheck
};

