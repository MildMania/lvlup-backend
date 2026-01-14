import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createGames() {
    console.log('🎮 Creating test games...');

    // Check if games exist
    const existingGames = await prisma.game.findMany();
    
    if (existingGames.length > 0) {
        console.log(`✅ ${existingGames.length} games already exist:`);
        existingGames.forEach(game => {
            console.log(`  - ${game.name} (API Key: ${game.apiKey})`);
        });
        return;
    }

    // Create games
    const games = await Promise.all([
        prisma.game.create({
            data: {
                name: 'Puzzle Quest Adventures',
                apiKey: 'pqa_api_key_12345',
                description: 'A popular match-3 puzzle game with RPG elements',
            },
        }),
        prisma.game.create({
            data: {
                name: 'Space Runner 3D',
                apiKey: 'sr3d_api_key_67890',
                description: 'An endless runner game set in space',
            },
        }),
        prisma.game.create({
            data: {
                name: 'City Builder Pro',
                apiKey: 'cbp_api_key_11111',
                description: 'Build and manage your own virtual city',
            },
        }),
    ]);

    console.log(`✅ Created ${games.length} games:`);
    games.forEach(game => {
        console.log(`  - ${game.name} (API Key: ${game.apiKey})`);
    });
}

createGames()
    .catch((e) => {
        console.error('❌ Error:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

