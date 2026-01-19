const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgresql://postgres:htuWpzEXNIsEaUtXYqgTeEqSBUypvXWU@mainline.proxy.rlwy.net:33261/railway',
    ssl: { rejectUnauthorized: false }
});
(async () => {
    await client.connect();
    // Check event names
    const names = await client.query(`
        SELECT DISTINCT "eventName", COUNT(*) as count
        FROM events
        WHERE "gameId" = 'cmk1phl2o0001pb1k2ubtq0fo'
        GROUP BY "eventName"
        ORDER BY count DESC;
    `);
    console.log('Event Names:');
    console.log(names.rows);
    // Check sample event with properties
    const sample = await client.query(`
        SELECT "eventName", properties
        FROM events
        WHERE "gameId" = 'cmk1phl2o0001pb1k2ubtq0fo'
        LIMIT 5;
    `);
    console.log('\nSample Events:');
    console.log(JSON.stringify(sample.rows, null, 2));
    await client.end();
})();
