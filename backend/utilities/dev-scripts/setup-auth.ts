import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createSuperAdmin() {
    const email = process.env.SUPER_ADMIN_EMAIL || 'admin@lvlup.com';
    const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!@#';
    const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
    const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';

    // Check if super admin already exists
    const existing = await prisma.dashboardUser.findUnique({
        where: { email },
    });

    if (existing) {
        console.log('✅ Super admin already exists:', email);
        console.log('📧 Email:', email);
        console.log('🔑 Password:', password);
        console.log('');
        console.log('⚠️  If you forgot the password, you can reset it via the database');
        return existing;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create super admin user
    const superAdmin = await prisma.dashboardUser.create({
        data: {
            email,
            passwordHash,
            firstName,
            lastName,
            isEmailVerified: true,
            isActive: true,
        },
    });

    // Create default "System" team
    const systemTeam = await prisma.team.create({
        data: {
            name: 'System Administrators',
            description: 'Default team for system administrators',
            slug: 'system-admins',
        },
    });

    // Add super admin to system team with SUPER_ADMIN role
    await prisma.teamMember.create({
        data: {
            teamId: systemTeam.id,
            userId: superAdmin.id,
            role: 'SUPER_ADMIN',
        },
    });

    // Grant access to all games
    await prisma.gameAccess.create({
        data: {
            userId: superAdmin.id,
            allGames: true,
            accessLevel: 'OWNER',
            grantedBy: superAdmin.id,
        },
    });

    console.log('✅ Super admin created successfully!');
    console.log('');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('');
    console.log('⚠️  Please change the password after first login!');
    console.log('');
    console.log('🌐 Login at: http://localhost:5173/login');

    return superAdmin;
}

async function main() {
    console.log('🚀 Setting up authentication system...\n');

    try {
        await createSuperAdmin();
        console.log('\n✅ Authentication system setup complete!');
    } catch (error) {
        console.error('❌ Error setting up authentication system:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

