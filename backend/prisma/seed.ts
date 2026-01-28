import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to generate dates in the past
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Seed level funnel data for Puzzle Quest Adventures
async function seedLevelFunnelData(games: any[], daysAgoFn: (days: number) => Date) {
    console.log('🎮 Seeding level funnel data for Puzzle Quest Adventures...');
    
    // Find Puzzle Quest Adventures game
    const puzzleGame = games.find(g => g.name === 'Puzzle Quest Adventures' || g.name.includes('Puzzle'));
    
    if (!puzzleGame) {
        console.log('⚠️  Puzzle Quest Adventures game not found, skipping level funnel seed');
        return;
    }

    // Delete existing level events to avoid conflicts
    console.log('Clearing existing level events...');
    await prisma.event.deleteMany({
        where: {
            gameId: puzzleGame.id,
            eventName: { in: ['level_start', 'level_complete', 'level_failed'] }
        }
    });

    // Get or create users for this game
    let puzzleUsers = await prisma.user.findMany({ where: { gameId: puzzleGame.id } });
    
    // If no users exist, create some
    if (puzzleUsers.length === 0) {
        console.log('Creating 100 test users for level funnel...');
        const testUsers = [];
        const platforms = ['iOS', 'Android', 'WebGL'];
        const versions = ['1.0.0', '1.1.0'];
        const countries = ['US', 'UK', 'DE', 'FR'];
        
        for (let i = 0; i < 100; i++) {
            testUsers.push({
                gameId: puzzleGame.id,
                externalId: `test_user_${i + 1}`,
                deviceId: `device_${Math.random().toString(36).substring(7)}`,
                platform: platforms[Math.floor(Math.random() * platforms.length)] as string,
                version: versions[Math.floor(Math.random() * versions.length)] as string,
                country: countries[Math.floor(Math.random() * countries.length)] as string,
                language: 'en',
                createdAt: daysAgoFn(Math.floor(Math.random() * 30)),
            });
        }
        await prisma.user.createMany({ data: testUsers });
        puzzleUsers = await prisma.user.findMany({ where: { gameId: puzzleGame.id } });
    }
    
    // Configuration for realistic level funnel
    const levelConfig = [
        { level: 1, winRate: 0.90, avgAttempts: 1.1, avgTime: 45, boosterUsage: 0.15, egpRate: 0.10 },
        { level: 2, winRate: 0.87, avgAttempts: 1.2, avgTime: 52, boosterUsage: 0.20, egpRate: 0.12 },
        { level: 3, winRate: 0.85, avgAttempts: 1.3, avgTime: 58, boosterUsage: 0.25, egpRate: 0.15 },
        { level: 4, winRate: 0.82, avgAttempts: 1.4, avgTime: 65, boosterUsage: 0.28, egpRate: 0.18 },
        { level: 5, winRate: 0.80, avgAttempts: 1.5, avgTime: 70, boosterUsage: 0.30, egpRate: 0.20 },
        { level: 6, winRate: 0.78, avgAttempts: 1.6, avgTime: 75, boosterUsage: 0.32, egpRate: 0.22 },
        { level: 7, winRate: 0.75, avgAttempts: 1.7, avgTime: 80, boosterUsage: 0.35, egpRate: 0.25 },
        { level: 8, winRate: 0.73, avgAttempts: 1.8, avgTime: 85, boosterUsage: 0.38, egpRate: 0.28 },
        { level: 9, winRate: 0.70, avgAttempts: 2.0, avgTime: 90, boosterUsage: 0.40, egpRate: 0.30 },
        { level: 10, winRate: 0.68, avgAttempts: 2.2, avgTime: 95, boosterUsage: 0.45, egpRate: 0.32 },
    ];

    const levelEvents = [];
    let eventCounter = Date.now(); // Use timestamp for unique IDs
    
    // Assign level funnels to users (simulate A/B testing)
    const levelFunnels = [
        { funnel: 'live_v1', version: 1 },
        { funnel: 'live_v1', version: 2 },
        { funnel: 'live_v2', version: 1 },
        { funnel: 'test_hard', version: 1 },
    ];

    // Assign each user to a random funnel
    const userFunnelAssignments = new Map();
    puzzleUsers.forEach(user => {
        const assignment = levelFunnels[Math.floor(Math.random() * levelFunnels.length)];
        userFunnelAssignments.set(user.id, assignment);
    });

    console.log('📊 Assigned users to level funnels:', 
        Array.from(userFunnelAssignments.values()).reduce((acc, curr) => {
            const key = `${curr.funnel}_${curr.version}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    );

    for (let userIdx = 0; userIdx < puzzleUsers.length; userIdx++) {
        const user = puzzleUsers[userIdx];
        if (!user) continue; // Skip if user is undefined
        
        let currentLevel = 1;
        let hasQuit = false;
        const baseTime = daysAgoFn(Math.floor(Math.random() * 30));
        let timeOffset = 0;

        while (!hasQuit && currentLevel <= 10) {
            const config = levelConfig[currentLevel - 1];
            if (!config) break; // Skip if config is undefined
            
            const attempts = Math.ceil(config.avgAttempts + (Math.random() - 0.5) * 0.5);
            
            for (let attempt = 1; attempt <= attempts; attempt++) {
                const attemptTime = new Date(baseTime.getTime() + timeOffset * 1000);
                timeOffset += 10;

                // Level start event
                levelEvents.push({
                    id: `event_level_${eventCounter++}`,
                    gameId: puzzleGame.id,
                    userId: user.id,
                    sessionId: null,
                    eventName: 'level_start',
                    properties: {
                        levelId: currentLevel,
                        levelName: `Level ${currentLevel}`,
                        attempt: attempt,
                    },
                    timestamp: attemptTime,
                    platform: user.platform,
                    appVersion: user.version,
                    country: user.country,
                    countryCode: user.country,
                    levelFunnel: userFunnelAssignments.get(user.id)?.funnel,
                    levelFunnelVersion: userFunnelAssignments.get(user.id)?.version,
                });

                const duration = Math.round(config.avgTime + (Math.random() - 0.5) * 20);
                const endTime = new Date(attemptTime.getTime() + duration * 1000);
                timeOffset += duration;

                const willSucceed = attempt === attempts && Math.random() < config.winRate;
                const usesBoosters = Math.random() < config.boosterUsage;
                const usesEGP = !willSucceed && Math.random() < config.egpRate;

                if (willSucceed) {
                    levelEvents.push({
                        id: `event_level_${eventCounter++}`,
                        gameId: puzzleGame.id,
                        userId: user.id,
                        sessionId: null,
                        eventName: 'level_complete',
                        properties: {
                            levelId: currentLevel,
                            levelName: `Level ${currentLevel}`,
                            score: Math.floor(5000 + Math.random() * 5000),
                            timeSeconds: duration,
                            stars: Math.floor(Math.random() * 3) + 1,
                            boosters: usesBoosters ? Math.floor(Math.random() * 3) + 1 : 0,
                            coinsEarned: Math.floor(100 + Math.random() * 200),
                            preGameBoosters: Math.random() > 0.7 ? 1 : 0,
                        },
                        timestamp: endTime,
                        platform: user.platform,
                        appVersion: user.version,
                        country: user.country,
                        countryCode: user.country,
                        levelFunnel: userFunnelAssignments.get(user.id)?.funnel,
                        levelFunnelVersion: userFunnelAssignments.get(user.id)?.version,
                    });
                    currentLevel++;
                    
                    if (Math.random() > 0.85) {
                        hasQuit = true;
                    }
                } else {
                    levelEvents.push({
                        id: `event_level_${eventCounter++}`,
                        gameId: puzzleGame.id,
                        userId: user.id,
                        sessionId: null,
                        eventName: 'level_failed',
                        properties: {
                            levelId: currentLevel,
                            levelName: `Level ${currentLevel}`,
                            reason: ['timeout', 'no_moves', 'lost_lives'][Math.floor(Math.random() * 3)],
                            timeSeconds: duration,
                            attempts: attempt,
                            boosters: usesBoosters ? Math.floor(Math.random() * 2) + 1 : 0,
                            egp: usesEGP,
                            endGamePurchase: usesEGP,
                        },
                        timestamp: endTime,
                        platform: user.platform,
                        appVersion: user.version,
                        country: user.country,
                        countryCode: user.country,
                        levelFunnel: userFunnelAssignments.get(user.id)?.funnel,
                        levelFunnelVersion: userFunnelAssignments.get(user.id)?.version,
                    });
                }
            }

            if (!hasQuit && Math.random() > config.winRate) {
                hasQuit = true;
            }
        }
    }

    console.log(`📝 Generated ${levelEvents.length} level events`);

    // Batch insert level events with smaller chunks for SQLite
    const levelEventChunks = [];
    for (let i = 0; i < levelEvents.length; i += 100) { // Reduced from 1000 to 100
        levelEventChunks.push(levelEvents.slice(i, i + 100));
    }

    for (const chunk of levelEventChunks) {
        await prisma.event.createMany({ 
            data: chunk
        });
    }

    console.log('✅ Seeded level funnel data');
}

// Seed revenue data (Ad Impressions + In-App Purchases)
async function seedRevenueData(games: any[], daysAgoFn: (days: number) => Date) {
    console.log('💰 Seeding revenue data...');

    let totalRevenue = 0;
    let totalAdEvents = 0;
    let totalIapEvents = 0;

    for (const game of games) {
        console.log(`\n💵 Adding revenue for ${game.name}...`);

        // Get users for this game
        const gameUsers = await prisma.user.findMany({ 
            where: { gameId: game.id },
            include: { sessions: true }
        });

        if (gameUsers.length === 0) {
            console.log(`  ⚠️  No users found for ${game.name}, skipping`);
            continue;
        }

        let gameRevenue = 0;
        let gameAdEvents = 0;
        let gameIapEvents = 0;

        for (const user of gameUsers) {
            // Get or create sessions for this user
            let userSessions = user.sessions;

            if (userSessions.length === 0) {
                // Create at least one session
                const sessionDate = daysAgoFn(Math.floor(Math.random() * 30));
                const session = await prisma.session.create({
                    data: {
                        gameId: game.id,
                        userId: user.id,
                        startTime: sessionDate,
                        endTime: new Date(sessionDate.getTime() + 10 * 60 * 1000),
                        duration: 600,
                        platform: user.platform,
                        countryCode: user.country
                    }
                });
                userSessions = [session];
            }

            // Generate revenue for each session
            for (const session of userSessions.slice(0, 10)) { // Limit to 10 sessions per user
                const sessionDate = new Date(session.startTime);

                // Ad Impressions (90% of sessions have ads)
                const seesAds = Math.random() < 0.9;
                if (seesAds) {
                    const adCount = Math.floor(Math.random() * 5) + 1; // 1-5 ads per session

                    for (let adNum = 0; adNum < adCount; adNum++) {
                        const isRewarded = Math.random() < 0.3; // 30% rewarded ads
                        const adRevenue = isRewarded
                            ? Math.random() * 0.5 + 0.5 // $0.50-$1.00 for rewarded
                            : Math.random() * 0.05 + 0.01; // $0.01-$0.06 for interstitial/banner

                        await prisma.revenue.create({
                            data: {
                                gameId: game.id,
                                userId: user.id,
                                sessionId: session.id,
                                revenueType: 'AD_IMPRESSION',
                                revenue: adRevenue,
                                currency: 'USD',
                                timestamp: new Date(sessionDate.getTime() + adNum * 2 * 60 * 1000),
                                adNetworkName: ['MAX', 'AdMob', 'IronSource', 'Unity Ads'][Math.floor(Math.random() * 4)],
                                adFormat: isRewarded ? 'REWARDED' : ['INTER', 'BANNER', 'MREC'][Math.floor(Math.random() * 3)],
                                adPlacement: ['level_complete', 'game_start', 'in_game', 'menu'][Math.floor(Math.random() * 4)],
                                adImpressionId: `ad_${user.id}_${session.id}_${adNum}_${Date.now()}`,
                                platform: user.platform,
                                appVersion: user.version,
                                country: user.country,
                                countryCode: user.country
                            }
                        });

                        gameRevenue += adRevenue;
                        gameAdEvents++;
                    }
                }

                // In-App Purchases (10% of sessions have IAP)
                const makesPurchase = Math.random() < 0.1;
                if (makesPurchase) {
                    const purchaseTier = Math.random();
                    let iapRevenue: number;
                    let productId: string;
                    let productName: string;

                    if (purchaseTier < 0.5) {
                        // 50% - Small pack
                        iapRevenue = Math.random() * 2 + 0.99;
                        productId = 'com.game.coins_small';
                        productName = '100 Coins';
                    } else if (purchaseTier < 0.8) {
                        // 30% - Medium pack
                        iapRevenue = Math.random() * 5 + 4.99;
                        productId = 'com.game.coins_medium';
                        productName = '500 Coins';
                    } else {
                        // 20% - Large pack
                        iapRevenue = Math.random() * 30 + 19.99;
                        productId = 'com.game.coins_large';
                        productName = '2000 Coins';
                    }

                    await prisma.revenue.create({
                        data: {
                            gameId: game.id,
                            userId: user.id,
                            sessionId: session.id,
                            revenueType: 'IN_APP_PURCHASE',
                            revenue: iapRevenue,
                            currency: 'USD',
                            timestamp: sessionDate,
                            productId: productId,
                            productName: productName,
                            productType: 'CONSUMABLE',
                            transactionId: `txn_${user.id}_${session.id}_${Date.now()}`,
                            store: user.platform === 'iOS' ? 'APPLE_APP_STORE' : user.platform === 'Android' ? 'GOOGLE_PLAY' : 'WEB_STORE',
                            isVerified: true,
                            quantity: 1,
                            isSandbox: false,
                            platform: user.platform,
                            appVersion: user.version,
                            country: user.country,
                            countryCode: user.country
                        }
                    });

                    gameRevenue += iapRevenue;
                    gameIapEvents++;
                }
            }
        }

        totalRevenue += gameRevenue;
        totalAdEvents += gameAdEvents;
        totalIapEvents += gameIapEvents;

        console.log(`  ✅ ${game.name}: $${gameRevenue.toFixed(2)} (${gameAdEvents} ads, ${gameIapEvents} IAP)`);
    }

    console.log(`\n💰 Revenue seeding complete!`);
    console.log(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Ad Events: ${totalAdEvents}`);
    console.log(`  IAP Events: ${totalIapEvents}`);
}

async function main() {
    console.log('🌱 Starting database seeding...');

    // Check if games already exist
    const existingGames = await prisma.game.findMany();
    
    let games;
    if (existingGames.length > 0) {
        console.log(`✅ Found ${existingGames.length} existing games, preserving them`);
        games = existingGames;
    } else {
        console.log('No existing games found, creating seed games...');
        
        // Clean existing data (in correct order to avoid foreign key constraints)
        await prisma.playerCheckpoint.deleteMany();
        await prisma.checkpoint.deleteMany();
        await prisma.testAssignment.deleteMany();
        await prisma.testVariant.deleteMany();
        await prisma.aBTest.deleteMany();
        await prisma.remoteConfig.deleteMany();
        await prisma.event.deleteMany();
        await prisma.session.deleteMany();
        await prisma.user.deleteMany();

        console.log('✅ Cleared existing data');

        // Create Games
        games = await Promise.all([
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

        console.log(`✅ Created ${games.length} games`);
    }

    // Helper function to generate dates in the past
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

    // If games already existed, skip the full seed and just add level events
    if (existingGames.length > 0) {
        console.log('⏭️  Skipping full seed, adding level funnel and revenue data...');
        await seedLevelFunnelData(games, daysAgo);
        await seedRevenueData(games, daysAgo);
        
        console.log('\n🌱 Database seeding completed successfully!');
        return;
    }

    // Create Users for each game
    const userBatches = await Promise.all(
        games.map(async (game, gameIndex) => {
            const users = [];
            const userCount = 1000 + gameIndex * 500; // 1000, 1500, 2000 users per game

            const platforms = ['iOS', 'Android', 'WebGL'];
            const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0'];
            const countries = ['US', 'UK', 'DE', 'FR', 'JP', 'KR', 'BR', 'IN'];
            const languages = ['en', 'de', 'fr', 'ja', 'ko', 'pt', 'hi'];

            for (let i = 0; i < userCount; i++) {
                const createdAt = daysAgo(Math.floor(Math.random() * 60)); // Users joined over last 60 days

                users.push({
                    gameId: game.id,
                    externalId: `user_${game.name.toLowerCase().replace(/\s+/g, '_')}_${i + 1}`,
                    deviceId: `device_${Math.random().toString(36).substring(7)}`,
                    platform: platforms[Math.floor(Math.random() * platforms.length)] as string,
                    version: versions[Math.floor(Math.random() * versions.length)] as string,
                    country: countries[Math.floor(Math.random() * countries.length)] as string,
                    language: languages[Math.floor(Math.random() * languages.length)] as string,
                    createdAt,
                });
            }

            return prisma.user.createMany({ data: users });
        })
    );

    const totalUsers = userBatches.reduce((sum, batch) => sum + batch.count, 0);
    console.log(`✅ Created ${totalUsers} users across all games`);

    // Fetch created users for session and event creation
    const allUsers = await prisma.user.findMany({ include: { game: true } });


    // Batch create sessions and events for all users
    const allSessions = [];
    const allEvents = [];
    const eventTypes = {
        'Puzzle Quest Adventures': [
            'level_start', 'level_complete', 'level_fail', 'power_up_used',
            'purchase_made', 'daily_reward_claimed', 'tutorial_step_completed'
        ],
        'Space Runner 3D': [
            'game_start', 'game_over', 'power_up_collected', 'obstacle_hit',
            'high_score_achieved', 'shop_visited', 'achievement_unlocked'
        ],
        'City Builder Pro': [
            'building_placed', 'building_upgraded', 'resource_collected', 'quest_completed',
            'city_expanded', 'population_milestone', 'trade_completed'
        ],
    };

    for (const user of allUsers) {
        const registrationDate = new Date(user.createdAt);
        const daysSinceRegistration = Math.min(30, Math.floor((Date.now() - registrationDate.getTime()) / (24 * 60 * 60 * 1000)));
        const retentionProbabilities = {
            1: 0.65,
            2: 0.50,
            3: 0.42,
            7: 0.35,
            14: 0.25,
            30: 0.15
        };

        for (let dayOffset = 0; dayOffset <= daysSinceRegistration; dayOffset++) {
            let returnProbability = 1.0;
            if (dayOffset === 1) returnProbability = retentionProbabilities[1];
            else if (dayOffset === 2) returnProbability = retentionProbabilities[2];
            else if (dayOffset === 3) returnProbability = retentionProbabilities[3];
            else if (dayOffset <= 7) returnProbability = retentionProbabilities[7];
            else if (dayOffset <= 14) returnProbability = retentionProbabilities[14];
            else if (dayOffset <= 30) returnProbability = retentionProbabilities[30];
            else returnProbability = 0.1;
            if (dayOffset > 0 && Math.random() > returnProbability) continue;
            // Randomly assign 1-4 sessions per day for realistic variation
            const dailySessionsCount = Math.floor(Math.random() * 4) + 1; // 1-4 sessions per day
            for (let sessionIdx = 0; sessionIdx < dailySessionsCount; sessionIdx++) {
                const sessionStart = new Date(registrationDate);
                sessionStart.setDate(sessionStart.getDate() + dayOffset);
                sessionStart.setHours(
                    Math.floor(Math.random() * 16) + 6,
                    Math.floor(Math.random() * 60),
                    Math.floor(Math.random() * 60)
                );
                const sessionDuration = Math.floor(Math.random() * 3600) + 300;
                const sessionEnd = new Date(sessionStart.getTime() + sessionDuration * 1000);
                const sessionObj = {
                    gameId: user.gameId,
                    userId: user.id,
                    startTime: sessionStart,
                    endTime: sessionEnd,
                    duration: sessionDuration,
                    platform: user.platform,
                    version: user.version,
                };
                allSessions.push(sessionObj);
            }
        }
    }

    // Batch insert sessions with smaller chunks for SQLite
    const sessionInsertChunks = [];
    for (let i = 0; i < allSessions.length; i += 100) { // Reduced from 1000 to 100
        sessionInsertChunks.push(allSessions.slice(i, i + 100));
    }
    let createdSessions = [];
    for (const chunk of sessionInsertChunks) {
        const result = await prisma.session.createMany({ data: chunk });
        createdSessions.push(result);
    }

    // Fetch all sessions with IDs for event creation
    const sessionsWithIds = await prisma.session.findMany();

    // Create events for each session
    for (const session of sessionsWithIds) {
        const gameName = allUsers.find(u => u.id === session.userId)?.game?.name || 'Puzzle Quest Adventures';
        const gameEvents = eventTypes[gameName as keyof typeof eventTypes] || eventTypes['Puzzle Quest Adventures'];
        const eventsCount = 2; // Reduced from 5 to 2 for SQLite performance
        for (let j = 0; j < eventsCount; j++) {
            const eventTime = new Date(
                session.startTime.getTime() + (j / eventsCount) * (session.duration || 300) * 1000
            );
            const eventName = gameEvents[Math.floor(Math.random() * gameEvents.length)];
            if (!eventName) continue;
            let properties = {};
            switch (eventName) {
                case 'level_start':
                case 'level_complete':
                case 'level_fail':
                    properties = {
                        level: Math.floor(Math.random() * 100) + 1,
                        difficulty: ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)],
                        score: Math.floor(Math.random() * 10000),
                    };
                    break;
                case 'purchase_made':
                    properties = {
                        item_id: `item_${Math.floor(Math.random() * 50) + 1}`,
                        item_type: ['power_up', 'currency', 'cosmetic'][Math.floor(Math.random() * 3)],
                        price: (Math.random() * 10).toFixed(2),
                        currency: 'USD',
                    };
                    break;
                case 'building_placed':
                case 'building_upgraded':
                    properties = {
                        building_type: ['house', 'shop', 'park', 'office'][Math.floor(Math.random() * 4)],
                        level: Math.floor(Math.random() * 10) + 1,
                        cost: Math.floor(Math.random() * 1000) + 100,
                    };
                    break;
                default:
                    properties = {
                        value: Math.floor(Math.random() * 1000),
                        context: 'gameplay',
                    };
            }
            allEvents.push({
                gameId: session.gameId,
                userId: session.userId,
                sessionId: session.id,
                eventName,
                properties,
                timestamp: eventTime,
            });
        }
    }

    // Batch insert events with smaller chunks for SQLite
    const eventInsertChunks = [];
    for (let i = 0; i < allEvents.length; i += 100) { // Reduced from 1000 to 100
        eventInsertChunks.push(allEvents.slice(i, i + 100));
    }
    let createdEvents = [];
    for (const chunk of eventInsertChunks) {
        const result = await prisma.event.createMany({ data: chunk });
        createdEvents.push(result);
    }

    console.log('✅ Created sessions and events for all users');

    // Create Checkpoints for each game
    const checkpointData = {
        'Puzzle Quest Adventures': [
            { name: 'tutorial_complete', description: 'Complete the tutorial', type: 'tutorial', order: 1 },
            { name: 'level_10_reached', description: 'Reach level 10', type: 'level', order: 2 },
            { name: 'first_power_up', description: 'Use first power-up', type: 'feature_unlock', order: 3 },
            { name: 'level_25_reached', description: 'Reach level 25', type: 'level', order: 4 },
            { name: 'first_purchase', description: 'Make first purchase', type: 'achievement', order: 5 },
            { name: 'level_50_reached', description: 'Reach level 50', type: 'level', order: 6 },
        ],
        'Space Runner 3D': [
            { name: 'first_run', description: 'Complete first run', type: 'tutorial', order: 1 },
            { name: 'score_1000', description: 'Score 1000 points', type: 'achievement', order: 2 },
            { name: 'power_up_master', description: 'Collect 10 power-ups', type: 'achievement', order: 3 },
            { name: 'score_5000', description: 'Score 5000 points', type: 'achievement', order: 4 },
            { name: 'daily_player', description: 'Play for 7 consecutive days', type: 'achievement', order: 5 },
        ],
        'City Builder Pro': [
            { name: 'first_building', description: 'Place first building', type: 'tutorial', order: 1 },
            { name: 'population_100', description: 'Reach 100 population', type: 'achievement', order: 2 },
            { name: 'first_upgrade', description: 'Upgrade first building', type: 'feature_unlock', order: 3 },
            { name: 'population_500', description: 'Reach 500 population', type: 'achievement', order: 4 },
            { name: 'city_expansion', description: 'Expand city boundaries', type: 'feature_unlock', order: 5 },
            { name: 'population_1000', description: 'Reach 1000 population', type: 'achievement', order: 6 },
        ],
    };

    for (const game of games) {
        const gameCheckpoints = checkpointData[game.name as keyof typeof checkpointData] || [];

        for (const checkpointInfo of gameCheckpoints) {
            await prisma.checkpoint.create({
                data: {
                    gameId: game.id,
                    name: checkpointInfo.name,
                    description: checkpointInfo.description,
                    type: checkpointInfo.type,
                    tags: [checkpointInfo.type, 'main_progression'], // JSON array
                    order: checkpointInfo.order,
                },
            });
        }
    }

    console.log('✅ Created checkpoints for all games');

    // Create PlayerCheckpoints (user progression)
    const allCheckpoints = await prisma.checkpoint.findMany();

    for (const user of allUsers) {
        const userCheckpoints = allCheckpoints.filter((cp: any) => cp.gameId === user.gameId);

        // Simulate realistic progression - users complete checkpoints in order with some dropoff
        let completionRate = 0.9; // Start with 90% completion rate

        for (const checkpoint of userCheckpoints.sort((a: any, b: any) => (a.order || 0) - (b.order || 0))) {
            if (Math.random() < completionRate) {
                const completionTime = new Date(
                    user.createdAt.getTime() + Math.random() * (Date.now() - user.createdAt.getTime())
                );

                await prisma.playerCheckpoint.create({
                    data: {
                        gameId: user.gameId,
                        userId: user.id,
                        checkpointId: checkpoint.id,
                        timestamp: completionTime,
                        metadata: {
                            attempts: Math.floor(Math.random() * 3) + 1,
                            time_taken: Math.floor(Math.random() * 300) + 30, // 30 seconds to 5 minutes
                            context: 'gameplay',
                        },
                    },
                });
            }

            // Reduce completion rate for later checkpoints (funnel effect)
            completionRate *= 0.8;
        }
    }

    console.log('✅ Created player checkpoint progressions');

    // Create Remote Configs
    for (const game of games) {
        const configs = [
            {
                key: 'daily_reward_amount',
                value: { coins: 100, gems: 5 },
                dataType: 'json',
                description: 'Daily reward configuration',
            },
            {
                key: 'difficulty_settings',
                value: {
                    easy: { multiplier: 0.8, lives: 5 },
                    medium: { multiplier: 1.0, lives: 3 },
                    hard: { multiplier: 1.5, lives: 1 }
                },
                dataType: 'json',
                description: 'Game difficulty settings',
            },
            {
                key: 'shop_featured_items',
                value: ['power_up_1', 'power_up_2', 'cosmetic_skin_1'],
                dataType: 'json',
                description: 'Featured items in shop',
            },
            {
                key: 'tutorial_enabled',
                value: true,
                dataType: 'boolean',
                description: 'Enable/disable tutorial for new users',
            },
        ];

        for (const config of configs) {
            await prisma.remoteConfig.create({
                data: {
                    gameId: game.id,
                    key: config.key,
                    value: config.value,
                    dataType: config.dataType,
                    environment: 'production',
                    enabled: true,
                    description: config.description,
                },
            });
        }
    }

    console.log('✅ Created remote configurations');

    // Create A/B Tests
    for (const game of games) {
        const abTest = await prisma.aBTest.create({
            data: {
                gameId: game.id,
                name: 'New Player Onboarding',
                description: 'Test different onboarding flows for new players',
                status: 'RUNNING',
                trafficSplit: 0.5,
                startDate: daysAgo(30),
                endDate: daysAgo(-30), // 30 days in the future
            },
        });

        // Create test variants
        const variants = await Promise.all([
            prisma.testVariant.create({
                data: {
                    testId: abTest.id,
                    name: 'Control',
                    description: 'Original onboarding flow',
                    config: { tutorial_steps: 5, skip_button: false },
                    weight: 0.5,
                },
            }),
            prisma.testVariant.create({
                data: {
                    testId: abTest.id,
                    name: 'Simplified',
                    description: 'Simplified onboarding with skip option',
                    config: { tutorial_steps: 3, skip_button: true },
                    weight: 0.5,
                },
            }),
        ]);

        // Assign users to test variants
        const gameUsers = allUsers.filter(u => u.gameId === game.id);
        for (const user of gameUsers.slice(0, Math.floor(gameUsers.length * 0.6))) { // 60% of users in test
            const variant = variants[Math.floor(Math.random() * variants.length)];

            if (variant) {
                await prisma.testAssignment.create({
                    data: {
                        testId: abTest.id,
                        variantId: variant.id,
                        userId: user.id,
                        assignedAt: new Date(Math.max(user.createdAt.getTime(), abTest.startDate?.getTime() || 0)),
                    },
                });
            }
        }
    }

    console.log('✅ Created A/B tests and assignments');

    // Seed revenue data for all games
    await seedRevenueData(games, daysAgo);

    // Print summary statistics
    const stats = {
        games: await prisma.game.count(),
        users: await prisma.user.count(),
        sessions: await prisma.session.count(),
        events: await prisma.event.count(),
        checkpoints: await prisma.checkpoint.count(),
        playerCheckpoints: await prisma.playerCheckpoint.count(),
        remoteConfigs: await prisma.remoteConfig.count(),
        abTests: await prisma.aBTest.count(),
        testAssignments: await prisma.testAssignment.count(),
    };

    console.log('\n📊 Seed Summary:');
    console.log('=================');
    Object.entries(stats).forEach(([key, value]) => {
        console.log(`${key.padEnd(20)}: ${value.toLocaleString()}`);
    });

    console.log('\n🎮 Games Created:');
    const gamesWithStats = await prisma.game.findMany({
        include: {
            _count: {
                select: {
                    users: true,
                    sessions: true,
                    events: true,
                },
            },
        },
    });

    gamesWithStats.forEach(game => {
        console.log(`  ${game.name}:`);
        console.log(`    API Key: ${game.apiKey}`);
        console.log(`    Users: ${game._count.users}`);
        console.log(`    Sessions: ${game._count.sessions}`);
        console.log(`    Events: ${game._count.events}`);
        console.log('');
    });

    console.log('🌱 Database seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e);
        // process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });











