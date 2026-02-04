/**
 * Railway Migration Script - Direct Connection
 * 
 * This script connects directly to Railway's PostgreSQL using the PUBLIC database URL
 * and runs the session duration fix.
 * 
 * USAGE:
 *   node fix-sessions-railway-direct.js
 * 
 * You'll be prompted for your Railway DATABASE_URL
 */

const { Client } = require('pg');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🚂 Railway Session Duration Fix - Direct Connection');
console.log('====================================================\n');
console.log('📋 How to get your Railway DATABASE_URL:');
console.log('1. Go to https://railway.app');
console.log('2. Click your project → PostgreSQL service');
console.log('3. Click "Connect" button (top right)');
console.log('4. Copy "Postgres Connection URL"\n');
console.log('⚠️  Make sure it looks like:');
console.log('   postgresql://postgres:xxxxx@containers-us-west-XX.railway.app:7432/railway');
console.log('   NOT: postgres.railway.internal (that won\'t work)\n');
console.log('====================================================\n');

rl.question('Paste your Railway DATABASE_URL here: ', async (databaseUrl) => {
    rl.close();

    if (!databaseUrl || databaseUrl.trim() === '') {
        console.error('\n❌ No DATABASE_URL provided');
        process.exit(1);
    }

    // Check if it's an internal URL
    if (databaseUrl.includes('railway.internal')) {
        console.error('\n❌ ERROR: This is an INTERNAL database URL');
        console.error('   It won\'t work from your local machine.\n');
        console.error('   You need the PUBLIC/EXTERNAL URL instead.');
        console.error('   Look for the "Connect" button in Railway dashboard.\n');
        process.exit(1);
    }

    console.log('\n🔗 Connecting to Railway PostgreSQL...\n');

    const client = new Client({
        connectionString: databaseUrl.trim(),
        ssl: {
            rejectUnauthorized: false // Railway uses self-signed certificates
        }
    });

    try {
        await client.connect();
        console.log('✅ Connected successfully!\n');

        // Step 1: Check how many sessions need fixing
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 1: Checking sessions...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const checkQuery = `
            SELECT COUNT(*) as sessions_to_fix
            FROM sessions
            WHERE "endTime" IS NOT NULL
              AND "lastHeartbeat" IS NOT NULL
              AND "lastHeartbeat" > "endTime";
        `;

        const checkResult = await client.query(checkQuery);
        const sessionsToFix = parseInt(checkResult.rows[0].sessions_to_fix);

        console.log(`Found ${sessionsToFix} sessions that need fixing\n`);

        if (sessionsToFix === 0) {
            console.log('✅ No sessions need fixing! Your database is clean.\n');
            await client.end();
            return;
        }

        // Step 2: Show examples
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 2: Example sessions (showing first 5)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const examplesQuery = `
            SELECT 
                id,
                platform,
                duration as current_duration,
                EXTRACT(EPOCH FROM ("lastHeartbeat" - "startTime"))::int as corrected_duration,
                EXTRACT(EPOCH FROM ("lastHeartbeat" - "endTime"))::int as difference_seconds
            FROM sessions
            WHERE "endTime" IS NOT NULL
              AND "lastHeartbeat" IS NOT NULL
              AND "lastHeartbeat" > "endTime"
            ORDER BY "lastHeartbeat" DESC
            LIMIT 5;
        `;

        const examplesResult = await client.query(examplesQuery);
        examplesResult.rows.forEach(row => {
            console.log(`Session: ${row.id.substring(0, 12)}...`);
            console.log(`  Platform: ${row.platform || 'unknown'}`);
            console.log(`  Current duration: ${row.current_duration}s`);
            console.log(`  Corrected duration: ${row.corrected_duration}s`);
            console.log(`  Difference: +${row.difference_seconds}s\n`);
        });

        // Step 3: Ask for confirmation
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 3: Ready to fix sessions');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`⚠️  About to update ${sessionsToFix} sessions:`);
        console.log('   - end_time will be updated to last_heartbeat');
        console.log('   - duration will be recalculated\n');
        console.log('Proceeding in 5 seconds... (Press Ctrl+C to cancel)\n');

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 4: Apply the fix
        console.log('🔧 Applying fix...\n');

        const fixQuery = `
            UPDATE sessions
            SET 
                "endTime" = CASE 
                    WHEN "lastHeartbeat" > "endTime" THEN "lastHeartbeat" 
                    ELSE "endTime" 
                END,
                duration = GREATEST(
                    EXTRACT(EPOCH FROM ("endTime" - "startTime")),
                    EXTRACT(EPOCH FROM ("lastHeartbeat" - "startTime"))
                )::int
            WHERE "endTime" IS NOT NULL
              AND "lastHeartbeat" IS NOT NULL
              AND "lastHeartbeat" > "endTime";
        `;

        const fixResult = await client.query(fixQuery);
        console.log(`✅ Updated ${fixResult.rowCount} sessions\n`);

        // Step 5: Verify
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 4: Verifying fix...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const verifyResult = await client.query(checkQuery);
        const remainingIssues = parseInt(verifyResult.rows[0].sessions_to_fix);

        if (remainingIssues === 0) {
            console.log('✅ Success! All sessions fixed!\n');
            console.log('📊 Summary:');
            console.log(`   Sessions fixed: ${sessionsToFix}`);
            console.log(`   Remaining issues: ${remainingIssues}\n`);
        } else {
            console.log(`⚠️  Warning: ${remainingIssues} sessions still have issues\n`);
        }

        await client.end();
        console.log('✅ Migration complete!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('\nPossible causes:');
        console.error('  - Invalid DATABASE_URL');
        console.error('  - Database is not accessible from your network');
        console.error('  - Railway PostgreSQL public networking is disabled\n');
        
        try {
            await client.end();
        } catch (e) {
            // Ignore cleanup errors
        }
        
        process.exit(1);
    }
});

