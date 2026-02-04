const { Client } = require('pg');
const readline = require('readline');

const GAME_ID = 'cmk1phl2o0001pb1k2ubtq0fo';
const LEVEL = 1;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🔍 Find Level 1 Outliers - Railway');
console.log('===================================\n');
console.log(`Game ID: ${GAME_ID}`);
console.log(`Level: ${LEVEL}\n`);
console.log('Paste your Railway DATABASE_URL: ');

rl.question('', async (databaseUrl) => {
    rl.close();

    if (!databaseUrl || databaseUrl.trim() === '') {
        console.error('\n❌ No DATABASE_URL provided');
        process.exit(1);
    }

    if (databaseUrl.includes('railway.internal')) {
        console.error('\n❌ Use PUBLIC URL, not internal');
        process.exit(1);
    }

    const client = new Client({
        connectionString: databaseUrl.trim(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // Debug: Check what data exists
        console.log('🔍 Checking data...\n');
        
        const checkComplete = await client.query(
            'SELECT COUNT(*) as count FROM events WHERE "gameId" = $1 AND "eventName" = $2 AND (properties->>\'levelId\')::int = $3',
            [GAME_ID, 'level_complete', LEVEL]
        );
        console.log(`Level ${LEVEL} complete events: ${checkComplete.rows[0].count}`);
        
        const checkStart = await client.query(
            'SELECT COUNT(*) as count FROM events WHERE "gameId" = $1 AND "eventName" = $2 AND (properties->>\'levelId\')::int = $3',
            [GAME_ID, 'level_start', LEVEL]
        );
        console.log(`Level ${LEVEL} start events: ${checkStart.rows[0].count}`);
        
        // Check sample properties to see structure
        const sampleProps = await client.query(
            'SELECT properties FROM events WHERE "gameId" = $1 AND "eventName" = $2 LIMIT 1',
            [GAME_ID, 'level_complete']
        );
        if (sampleProps.rows.length > 0) {
            console.log('Sample properties:', JSON.stringify(sampleProps.rows[0].properties, null, 2));
        }
        console.log('');

        const query = `
            WITH level_completes AS (
                SELECT 
                    "userId",
                    "timestamp"
                FROM events
                WHERE "gameId" = $1
                  AND "eventName" = 'level_complete'
                  AND (properties->>'levelId')::int = $2
            )
            SELECT 
                c."userId",
                u."externalId" as user_external_id,
                EXTRACT(EPOCH FROM (c."timestamp" - s."timestamp")) as duration_seconds
            FROM level_completes c
            INNER JOIN LATERAL (
                SELECT "timestamp"
                FROM events
                WHERE "gameId" = $1
                  AND "eventName" = 'level_start'
                  AND (properties->>'levelId')::int = $2
                  AND "userId" = c."userId"
                  AND "timestamp" <= c."timestamp"
                ORDER BY "timestamp" DESC
                LIMIT 1
            ) s ON true
            LEFT JOIN users u ON c."userId" = u.id
            WHERE EXTRACT(EPOCH FROM (c."timestamp" - s."timestamp")) > 0
            ORDER BY duration_seconds DESC;
        `;

        const result = await client.query(query, [GAME_ID, LEVEL]);
        
        console.log(`Query returned ${result.rows.length} rows\n`);
        
        if (result.rows.length === 0) {
            console.log('No data found');
            await client.end();
            return;
        }

        // Debug: Check sample rows
        console.log('Sample rows:');
        result.rows.slice(0, 3).forEach((r, i) => {
            console.log(`  ${i + 1}. userId: ${r.userId}, duration: ${r.duration_seconds}, type: ${typeof r.duration_seconds}`);
        });
        console.log('');

        // Convert duration_seconds from string to number and filter
        const validRows = result.rows
            .map(r => ({
                ...r,
                duration_seconds: parseFloat(r.duration_seconds)
            }))
            .filter(r => {
                const d = r.duration_seconds;
                return d !== null && d !== undefined && !isNaN(d) && d > 0;
            });
        
        console.log(`Valid rows after filtering: ${validRows.length}\n`);
        
        if (validRows.length === 0) {
            console.log('❌ No valid durations found');
            console.log('   All duration values are null, NaN, or invalid');
            console.log('\n💡 Possible causes:');
            console.log('   - No level_start events found before level_complete events');
            console.log('   - Timestamps are not properly recorded');
            console.log('   - Users completed level without starting it first\n');
            await client.end();
            return;
        }
        
        const durations = validRows.map(r => r.duration_seconds);
        const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
        const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);
        const threshold = mean + (3 * stdDev);
        
        const sorted = [...durations].sort((a, b) => b - a);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        
        const outliers = validRows.filter(r => r.duration_seconds > threshold);
        const nonOutliers = durations.filter(d => d <= threshold);
        const meanWithoutOutliers = nonOutliers.length > 0 
            ? nonOutliers.reduce((a, b) => a + b, 0) / nonOutliers.length 
            : mean;

        console.log('📊 STATISTICS');
        console.log('─────────────────────────────────────────────');
        console.log(`Total: ${validRows.length}`);
        console.log(`Mean: ${(mean / 60).toFixed(2)} min (${mean.toFixed(2)}s)`);
        console.log(`Median: ${(median / 60).toFixed(2)} min (${median.toFixed(2)}s)`);
        console.log(`Std Dev: ${(stdDev / 60).toFixed(2)} min (${stdDev.toFixed(2)}s)`);
        console.log(`Min: ${(sorted[sorted.length - 1] / 60).toFixed(2)} min`);
        console.log(`Max: ${(sorted[0] / 60).toFixed(2)} min (${(sorted[0] / 3600).toFixed(2)} hours)`);
        console.log(`\nOutliers (>3 std dev): ${outliers.length} (${((outliers.length / validRows.length) * 100).toFixed(1)}%)\n`);

        console.log('🔝 TOP 20 LONGEST');
        console.log('─────────────────────────────────────────────');
        validRows.slice(0, 20).forEach((row, i) => {
            const mins = row.duration_seconds / 60;
            const hours = mins / 60;
            console.log(`${i + 1}. ${hours.toFixed(2)}h (${mins.toFixed(2)}m) - User: ${row.user_external_id || 'unknown'}`);
        });

        if (outliers.length > 0) {
            console.log('\n⚠️  OUTLIERS (>3 STD DEV)');
            console.log('─────────────────────────────────────────────');
            console.log(`Found ${outliers.length} outliers:\n`);
            outliers.slice(0, 10).forEach((row, i) => {
                const mins = row.duration_seconds / 60;
                console.log(`${i + 1}. ${mins.toFixed(2)}m - User: ${row.user_external_id || 'unknown'}`);
            });

            console.log('\n📊 WITHOUT OUTLIERS');
            console.log('─────────────────────────────────────────────');
            console.log(`Total: ${nonOutliers.length}`);
            console.log(`Mean: ${(meanWithoutOutliers / 60).toFixed(2)} min (${meanWithoutOutliers.toFixed(2)}s)`);
            console.log(`\n💡 Impact: Mean changes from ${(mean / 60).toFixed(2)}m to ${(meanWithoutOutliers / 60).toFixed(2)}m`);
            console.log(`   Difference: ${(((mean - meanWithoutOutliers) / mean) * 100).toFixed(1)}%`);
            console.log(`\n💡 Recommendation: Filter durations > ${(threshold / 60).toFixed(0)} minutes`);
        }

        await client.end();
        console.log('\n✅ Done\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        try { await client.end(); } catch (e) {}
        process.exit(1);
    }
});

