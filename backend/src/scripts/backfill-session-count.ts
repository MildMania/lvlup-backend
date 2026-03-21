import prismaInstance from '../prisma';

async function backfillSessionCount() {
    console.log('Starting session count backfill...');
    
    const batchSize = 100;
    let offset = 0;
    let totalUpdated = 0;
    
    while (true) {
        const users = await prismaInstance.user.findMany({
            select: { id: true },
            skip: offset,
            take: batchSize,
            orderBy: { createdAt: 'asc' }
        });
        
        if (users.length === 0) break;
        
        for (const user of users) {
            const sessionCount = await prismaInstance.session.count({
                where: { userId: user.id }
            });
            
            await prismaInstance.user.update({
                where: { id: user.id },
                data: { sessionCount }
            });
            
            totalUpdated++;
        }
        
        console.log('Processed ' + totalUpdated + ' users...');
        offset += batchSize;
    }
    
    console.log('Backfill complete. Updated ' + totalUpdated + ' users.');
    process.exit(0);
}

backfillSessionCount().catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
});
