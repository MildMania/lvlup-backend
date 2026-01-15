const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSessions() {
    try {
        console.log('🔧 Fixing sessions without endTime and duration...\n');

        // Get all sessions without endTime
        const incompleteSessions = await prisma.session.findMany({
            where: {
                OR: [
                    { endTime: null },
                    { duration: null }
                ]
            },
            select: {
                id: true,
                startTime: true,
                endTime: true,
                duration: true
            }
        });

        console.log(`Found ${incompleteSessions.length} incomplete sessions`);

        if (incompleteSessions.length === 0) {
            console.log('✅ All sessions are complete!');
            return;
        }

        let fixed = 0;

        for (const session of incompleteSessions) {
            // Assume a default session duration of 5 minutes (300 seconds) if not ended
            const defaultDuration = 300;
            const endTime = new Date(session.startTime.getTime() + defaultDuration * 1000);

            await prisma.session.update({
                where: { id: session.id },
                data: {
                    endTime: endTime,
                    duration: defaultDuration
                }
            });

            fixed++;
        }

        console.log(`✅ Fixed ${fixed} sessions with default 5-minute duration`);

        // Verify the fix
        const remainingIncomplete = await prisma.session.count({
            where: {
                OR: [
                    { endTime: null },
                    { duration: null }
                ]
            }
        });

        console.log(`\n📊 Remaining incomplete sessions: ${remainingIncomplete}`);

        // Show summary
        const validSessions = await prisma.session.count({
            where: {
                endTime: { not: null },
                duration: { not: null }
            }
        });
        console.log(`📊 Total valid sessions (with endTime and duration): ${validSessions}`);

    } catch (error) {
        console.error('❌ Error fixing sessions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixSessions();

