/**
 * Test script to verify session duration fix
 * Run with: npm test -- fix-session-durations.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from '../src/services/AnalyticsService';

const prisma = new PrismaClient();
const analyticsService = new AnalyticsService();

describe('Session Duration Fix', () => {
    let testGameId: string;
    let testUserId: string;
    let testSessionId: string;

    beforeAll(async () => {
        // Create test game and user
        const game = await prisma.game.create({
            data: {
                name: 'Test Game - Session Duration Fix',
                apiKey: `test_session_duration_${Date.now()}`,
                description: 'Test game for session duration fix'
            }
        });
        testGameId = game.id;

        const user = await prisma.user.create({
            data: {
                gameId: testGameId,
                externalId: `test_user_${Date.now()}`,
                platform: 'test'
            }
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        // Cleanup
        if (testGameId) {
            await prisma.session.deleteMany({ where: { gameId: testGameId } });
            await prisma.user.deleteMany({ where: { gameId: testGameId } });
            await prisma.game.delete({ where: { id: testGameId } });
        }
        await prisma.$disconnect();
    });

    it('should calculate duration using lastHeartbeat when it is greater than endTime', async () => {
        // Create a session
        const startTime = new Date('2026-01-17T10:00:00Z');
        const session = await prisma.session.create({
            data: {
                gameId: testGameId,
                userId: testUserId,
                startTime: startTime,
                platform: 'test'
            }
        });
        testSessionId = session.id;

        // Simulate heartbeat received after endSession is called
        const endTime = new Date('2026-01-17T10:05:00Z'); // 5 minutes later
        const lateHeartbeat = new Date('2026-01-17T10:05:30Z'); // 5.5 minutes later

        // Update lastHeartbeat (simulating a late heartbeat)
        await prisma.session.update({
            where: { id: testSessionId },
            data: { lastHeartbeat: lateHeartbeat }
        });

        // Call endSession
        const endedSession = await analyticsService.endSession(testSessionId, endTime.toISOString());

        // Duration should be based on lastHeartbeat (5.5 minutes = 330 seconds)
        expect(endedSession.duration).toBe(330);
        // endTime should also be updated to lastHeartbeat
        expect(endedSession.endTime?.toISOString()).toBe(lateHeartbeat.toISOString());
    });

    it('should calculate duration using endTime when lastHeartbeat is null', async () => {
        // Create a session without heartbeat
        const startTime = new Date('2026-01-17T11:00:00Z');
        const session = await prisma.session.create({
            data: {
                gameId: testGameId,
                userId: testUserId,
                startTime: startTime,
                platform: 'test',
                lastHeartbeat: null
            }
        });

        const endTime = new Date('2026-01-17T11:10:00Z'); // 10 minutes later

        // Call endSession
        const endedSession = await analyticsService.endSession(session.id, endTime.toISOString());

        // Duration should be based on endTime (10 minutes = 600 seconds)
        expect(endedSession.duration).toBe(600);
    });

    it('should calculate duration using endTime when lastHeartbeat is earlier than endTime', async () => {
        // Create a session
        const startTime = new Date('2026-01-17T12:00:00Z');
        const session = await prisma.session.create({
            data: {
                gameId: testGameId,
                userId: testUserId,
                startTime: startTime,
                platform: 'test'
            }
        });

        // Set lastHeartbeat before endTime
        const earlyHeartbeat = new Date('2026-01-17T12:03:00Z'); // 3 minutes
        await prisma.session.update({
            where: { id: session.id },
            data: { lastHeartbeat: earlyHeartbeat }
        });

        const endTime = new Date('2026-01-17T12:08:00Z'); // 8 minutes later

        // Call endSession
        const endedSession = await analyticsService.endSession(session.id, endTime.toISOString());

        // Duration should be based on endTime (8 minutes = 480 seconds)
        expect(endedSession.duration).toBe(480);
    });

    it('should handle edge case where lastHeartbeat equals endTime', async () => {
        // Create a session
        const startTime = new Date('2026-01-17T13:00:00Z');
        const session = await prisma.session.create({
            data: {
                gameId: testGameId,
                userId: testUserId,
                startTime: startTime,
                platform: 'test'
            }
        });

        const endTime = new Date('2026-01-17T13:07:00Z'); // 7 minutes

        // Set lastHeartbeat equal to endTime
        await prisma.session.update({
            where: { id: session.id },
            data: { lastHeartbeat: endTime }
        });

        // Call endSession
        const endedSession = await analyticsService.endSession(session.id, endTime.toISOString());

        // Duration should be 7 minutes = 420 seconds
        expect(endedSession.duration).toBe(420);
    });

    it('should never return negative duration', async () => {
        // Create a session with startTime in the future (edge case)
        const startTime = new Date('2026-01-17T14:00:00Z');
        const session = await prisma.session.create({
            data: {
                gameId: testGameId,
                userId: testUserId,
                startTime: startTime,
                platform: 'test'
            }
        });

        // Try to end it with an earlier time (invalid, but should be handled gracefully)
        const endTime = new Date('2026-01-17T13:59:00Z');

        // Call endSession
        const endedSession = await analyticsService.endSession(session.id, endTime.toISOString());

        // Duration should be at least 0
        expect(endedSession.duration).toBeGreaterThanOrEqual(0);
    });
});

describe('Session Duration Utilities', () => {
    it('should correctly identify actual end time', () => {
        const { getActualSessionEndTime } = require('../src/utils/sessionUtils');

        const startTime = new Date('2026-01-17T10:00:00Z');
        const endTime = new Date('2026-01-17T10:05:00Z');
        const lateHeartbeat = new Date('2026-01-17T10:06:00Z');

        // Case 1: lastHeartbeat > endTime
        const actualEnd1 = getActualSessionEndTime({
            startTime,
            endTime,
            lastHeartbeat: lateHeartbeat
        });
        expect(actualEnd1).toEqual(lateHeartbeat);

        // Case 2: lastHeartbeat < endTime
        const earlyHeartbeat = new Date('2026-01-17T10:04:00Z');
        const actualEnd2 = getActualSessionEndTime({
            startTime,
            endTime,
            lastHeartbeat: earlyHeartbeat
        });
        expect(actualEnd2).toEqual(endTime);

        // Case 3: No lastHeartbeat
        const actualEnd3 = getActualSessionEndTime({
            startTime,
            endTime,
            lastHeartbeat: null
        });
        expect(actualEnd3).toEqual(endTime);

        // Case 4: No endTime (session still open)
        const actualEnd4 = getActualSessionEndTime({
            startTime,
            endTime: null,
            lastHeartbeat: lateHeartbeat
        });
        expect(actualEnd4).toEqual(lateHeartbeat);
    });

    it('should correctly calculate session duration', () => {
        const { calculateActualSessionDuration } = require('../src/utils/sessionUtils');

        const startTime = new Date('2026-01-17T10:00:00Z');
        const endTime = new Date('2026-01-17T10:05:00Z'); // 5 minutes = 300 seconds
        const lateHeartbeat = new Date('2026-01-17T10:06:30Z'); // 6.5 minutes = 390 seconds

        // Should use lateHeartbeat (390 seconds)
        const duration = calculateActualSessionDuration({
            startTime,
            endTime,
            lastHeartbeat: lateHeartbeat
        });
        expect(duration).toBe(390);
    });
});

