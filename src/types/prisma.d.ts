import { PrismaClient as OriginalPrismaClient } from '@prisma/client';

// Extend PrismaClient with our models
declare global {
    namespace NodeJS {
        interface Global {
            prisma: PrismaClient;
        }
    }
}

// Extend the PrismaClient type to include our models
declare module '@prisma/client' {
    interface PrismaClient {
        checkpoint: any;
        playerCheckpoint: any;
        session: any;
        // Add any other models you need
    }
}