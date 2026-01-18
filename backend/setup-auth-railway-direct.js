/**
 * Railway Setup Auth Script - Direct Connection
 * 
 * This script connects directly to Railway's PostgreSQL using the PUBLIC database URL
 * and creates the super admin dashboard user.
 * 
 * USAGE:
 *   node setup-auth-railway-direct.js
 * 
 * You'll be prompted for your Railway DATABASE_URL
 */

const { Client } = require('pg');
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🚂 Railway Setup Auth - Direct Connection');
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

        // Super admin credentials (same as in setup-auth.ts)
        const email = process.env.SUPER_ADMIN_EMAIL || 'admin@lvlup.com';
        const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!@#';
        const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
        const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 1: Checking if super admin exists...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Check if super admin already exists
        const checkQuery = `
            SELECT id, email, "firstName", "lastName", "isActive", "isEmailVerified"
            FROM "dashboard_users"
            WHERE email = $1
        `;
        const checkResult = await client.query(checkQuery, [email]);

        if (checkResult.rows.length > 0) {
            const existingUser = checkResult.rows[0];
            console.log('✅ Super admin already exists!');
            console.log('\n👤 User Details:');
            console.log(`   Email: ${existingUser.email}`);
            console.log(`   Name: ${existingUser.firstName} ${existingUser.lastName}`);
            console.log(`   Active: ${existingUser.isActive}`);
            console.log(`   Email Verified: ${existingUser.isEmailVerified}`);
            console.log('\n📧 Email:', email);
            console.log('🔑 Password:', password);
            console.log('\n⚠️  If you forgot the password, you can reset it via the database');
            console.log('   or delete this user and run the script again.\n');
            await client.end();
            return;
        }

        console.log('📝 Super admin not found. Creating new user...\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 2: Creating super admin user...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create super admin user
        const createUserQuery = `
            INSERT INTO "dashboard_users" (
                id,
                email,
                "passwordHash",
                "firstName",
                "lastName",
                "isEmailVerified",
                "isActive",
                "createdAt",
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                $1,
                $2,
                $3,
                $4,
                true,
                true,
                NOW(),
                NOW()
            )
            RETURNING id, email, "firstName", "lastName"
        `;

        const userResult = await client.query(createUserQuery, [
            email,
            passwordHash,
            firstName,
            lastName
        ]);

        const superAdmin = userResult.rows[0];
        console.log('✅ Super admin user created!');
        console.log(`   User ID: ${superAdmin.id}\n`);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 3: Creating "System Administrators" team...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Create default "System" team
        const createTeamQuery = `
            INSERT INTO "teams" (
                id,
                name,
                description,
                slug,
                "createdAt",
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                'System Administrators',
                'Default team for system administrators',
                'system-admins',
                NOW(),
                NOW()
            )
            RETURNING id, name
        `;

        const teamResult = await client.query(createTeamQuery);
        const systemTeam = teamResult.rows[0];
        console.log('✅ Team created!');
        console.log(`   Team ID: ${systemTeam.id}\n`);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 4: Adding super admin to team...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Add super admin to system team with SUPER_ADMIN role
        const addMemberQuery = `
            INSERT INTO "team_members" (
                id,
                "teamId",
                "userId",
                role,
                "createdAt",
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                $1,
                $2,
                'SUPER_ADMIN',
                NOW(),
                NOW()
            )
            RETURNING id
        `;

        await client.query(addMemberQuery, [systemTeam.id, superAdmin.id]);
        console.log('✅ Super admin added to team!\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('STEP 5: Granting access to all games...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Grant access to all games
        const grantAccessQuery = `
            INSERT INTO "game_accesses" (
                id,
                "userId",
                "allGames",
                "accessLevel",
                "grantedBy",
                "grantedAt"
            ) VALUES (
                gen_random_uuid(),
                $1,
                true,
                'OWNER',
                $1,
                NOW()
            )
            RETURNING id
        `;

        await client.query(grantAccessQuery, [superAdmin.id]);
        console.log('✅ Access granted to all games!\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ SETUP COMPLETE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('📧 Email:', email);
        console.log('🔑 Password:', password);
        console.log('\n⚠️  Please change the password after first login!');
        console.log('\n🌐 Login at: https://lvlup.mildmania.com/login');
        console.log('\n✅ You can now login with these credentials!\n');

        await client.end();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('\nFull error:', error);
        
        try {
            await client.end();
        } catch (e) {
            // Ignore disconnect errors
        }
        
        process.exit(1);
    }
});

