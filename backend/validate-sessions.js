const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function validateSessions() {
    try {
        console.log('🔍 Validating session data...\n');

        // Get total sessions
        const totalSessions = await prisma.session.count();
        console.log(`Total sessions: ${totalSessions}`);

        // Get sessions without endTime
        const sessionsWithoutEndTime = await prisma.session.count({
            where: { endTime: null }
        });
        console.log(`Sessions without endTime: ${sessionsWithoutEndTime}`);

        // Get sessions without duration
        const sessionsWithoutDuration = await prisma.session.count({
            where: { duration: null }
        });
        console.log(`Sessions without duration: ${sessionsWithoutDuration}`);

        // Get sessions with both endTime and duration
        const validSessions = await prisma.session.count({
            where: {
                endTime: { not: null },
                duration: { not: null }
            }
        });
        console.log(`Sessions with both endTime and duration: ${validSessions}`);

        // Get sample sessions to inspect
        console.log('\n📊 Sample sessions:');
        const sampleSessions = await prisma.session.findMany({
            take: 5,
            orderBy: { startTime: 'desc' },
            select: {
                id: true,
                userId: true,
                startTime: true,
                endTime: true,
                duration: true,
                user: {
                    select: {
                        externalId: true,
                        createdAt: true
                    }
                }
            }
        });

        sampleSessions.forEach((session, idx) => {
            console.log(`\nSession ${idx + 1}:`);
            console.log(`  ID: ${session.id}`);
            console.log(`  User: ${session.user.externalId}`);
            console.log(`  User Created: ${new Date(session.user.createdAt).toISOString()}`);
            console.log(`  Start Time: ${session.startTime?.toISOString()}`);
            console.log(`  End Time: ${session.endTime?.toISOString() || 'NULL'}`);
            console.log(`  Duration: ${session.duration !== null ? session.duration + ' seconds' : 'NULL'}`);
        });

        // Check if there are users created today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const todayUsers = await prisma.user.count({
            where: {
                createdAt: { gte: today, lte: todayEnd }
            }
        });
        console.log(`\n📅 Users created today: ${todayUsers}`);

        // Check sessions for today's users
        if (todayUsers > 0) {
            const todayUsersData = await prisma.user.findMany({
                where: {
                    createdAt: { gte: today, lte: todayEnd }
                },
                select: { id: true, externalId: true, createdAt: true }
            });

            console.log('\n🎯 Today\'s users and their sessions:');
            for (const user of todayUsersData) {
                const userSessions = await prisma.session.findMany({
                    where: { userId: user.id },
                    select: {
                        startTime: true,
                        endTime: true,
                        duration: true
                    }
                });

                console.log(`\nUser: ${user.externalId}`);
                console.log(`  Created: ${new Date(user.createdAt).toISOString()}`);
                console.log(`  Sessions: ${userSessions.length}`);
                userSessions.forEach((s, idx) => {
                    console.log(`    Session ${idx + 1}: start=${s.startTime?.toISOString()}, end=${s.endTime?.toISOString() || 'NULL'}, duration=${s.duration || 'NULL'}`);
                });
            }
        }

    } catch (error) {
        console.error('❌ Error validating sessions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

validateSessions();

