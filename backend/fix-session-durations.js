/**
 * Fix session durations for sessions where lastHeartbeat > endTime
 * 
 * This script identifies sessions where heartbeats were received after the session was marked as ended,
 * and updates both endTime and duration to use lastHeartbeat (the actual session end).
 * 
 * USAGE:
 * 
 * LOCAL:
 *   node fix-session-durations.js
 * 
 * RAILWAY (from your local machine):
 *   1. Get DATABASE_URL from Railway dashboard (Variables tab)
 *   2. Run: DATABASE_URL='postgresql://...' node fix-session-durations.js
 *   
 * RAILWAY (using script):
 *   DATABASE_URL='postgresql://...' ./fix-sessions-railway.sh
 * 
 * RAILWAY (via Railway CLI):
 *   railway run node fix-session-durations.js
 */

const { PrismaClient } = require('@prisma/client');


// Check which database we're using
const dbUrl = process.env.DATABASE_URL || '';
const isRailway = dbUrl.includes('railway.app') || (dbUrl.includes('postgres://') && !dbUrl.includes('file:'));
const isLocal = dbUrl.includes('file:') || dbUrl === '' || dbUrl.includes('dev.db');

console.log('🔧 Database Configuration:');
console.log(`   Environment: ${isRailway ? '🚂 Railway (PostgreSQL)' : isLocal ? '💻 Local (SQLite)' : '🗄️ PostgreSQL'}`);
if (dbUrl && !dbUrl.includes('file:')) {
    const maskedUrl = dbUrl.substring(0, 30) + '...' + dbUrl.substring(dbUrl.length - 20);
    console.log(`   Database URL: ${maskedUrl}`);
} else if (isLocal) {
    console.log(`   Database URL: file:./dev.db`);
}
console.log('');

const prisma = new PrismaClient();

async function fixSessionDurations() {
    console.log('🔍 Finding sessions with lastHeartbeat > endTime...\n');

    try {
        // Find all sessions where lastHeartbeat is greater than endTime
        const affectedSessions = await prisma.session.findMany({
            where: {
                endTime: { not: null },
                lastHeartbeat: { not: null },
                // This will find sessions where lastHeartbeat > endTime
                // We'll filter them in memory since Prisma doesn't support cross-field comparisons
            },
            select: {
                id: true,
                startTime: true,
                endTime: true,
                lastHeartbeat: true,
                duration: true,
                platform: true,
                userId: true
            }
        });

        // Filter to only sessions where lastHeartbeat > endTime
        const sessionsToFix = affectedSessions.filter(
            session => session.lastHeartbeat && session.endTime && session.lastHeartbeat > session.endTime
        );

        console.log(`Found ${sessionsToFix.length} sessions with lastHeartbeat > endTime\n`);

        if (sessionsToFix.length === 0) {
            console.log('✅ No sessions need fixing!');
            return;
        }

        // Show some examples
        console.log('Example sessions to fix:');
        sessionsToFix.slice(0, 5).forEach(session => {
            const oldDuration = session.duration || 0;
            const newDuration = Math.floor((session.lastHeartbeat.getTime() - session.startTime.getTime()) / 1000);
            const difference = newDuration - oldDuration;
            const timeDiff = Math.floor((session.lastHeartbeat.getTime() - session.endTime.getTime()) / 1000);
            
            console.log(`- Session ${session.id.substring(0, 12)}...`);
            console.log(`  Platform: ${session.platform || 'unknown'}`);
            console.log(`  Current duration: ${oldDuration}s`);
            console.log(`  Corrected duration: ${newDuration}s (${difference > 0 ? '+' : ''}${difference}s)`);
            console.log(`  Current endTime: ${session.endTime.toISOString()}`);
            console.log(`  Corrected endTime: ${session.lastHeartbeat.toISOString()} (+${timeDiff}s)`);
            console.log('');
        });

        // Ask for confirmation
        console.log(`\n⚠️  About to update ${sessionsToFix.length} sessions`);
        console.log('   - endTime will be set to lastHeartbeat');
        console.log('   - duration will be recalculated');
        console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
        
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Update sessions
        let successCount = 0;
        let errorCount = 0;

        console.log('🔧 Updating sessions...\n');

        for (const session of sessionsToFix) {
            try {
                // Calculate new duration using lastHeartbeat as the actual end time
                const actualEndTime = session.lastHeartbeat;
                const newDuration = Math.max(
                    Math.floor((actualEndTime.getTime() - session.startTime.getTime()) / 1000),
                    0
                );

                await prisma.session.update({
                    where: { id: session.id },
                    data: {
                        endTime: actualEndTime, // Update endTime to match lastHeartbeat
                        duration: newDuration
                    }
                });

                successCount++;
                
                if (successCount % 100 === 0) {
                    console.log(`✓ Updated ${successCount} sessions...`);
                }
            } catch (error) {
                errorCount++;
                console.error(`✗ Error updating session ${session.id}:`, error.message);
            }
        }

        console.log('\n✅ Migration complete!');
        console.log(`   Successfully updated: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        
        if (successCount > 0) {
            // Show statistics
            const totalDurationDifference = sessionsToFix.reduce((sum, session) => {
                const oldDuration = session.duration || 0;
                const newDuration = Math.floor((session.lastHeartbeat.getTime() - session.startTime.getTime()) / 1000);
                return sum + (newDuration - oldDuration);
            }, 0);
            
            const avgDifference = totalDurationDifference / sessionsToFix.length;
            console.log(`\n📊 Statistics:`);
            console.log(`   Average duration increase: ${Math.round(avgDifference)}s (${Math.round(avgDifference / 60)} minutes)`);
            console.log(`   Total duration added: ${Math.round(totalDurationDifference / 60)} minutes (${Math.round(totalDurationDifference / 3600)} hours)`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the migration
fixSessionDurations()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    });

