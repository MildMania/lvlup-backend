// Test setup file
import { PrismaClient } from '@prisma/client';
import { mockDeep, MockProxy } from 'jest-mock-extended';

// Setup mocks before imports
jest.mock('@prisma/client');
jest.mock('uuid', () => ({
    v4: jest.fn().mockReturnValue('mocked-uuid-value')
}));
jest.mock('../src/utils/logger', () => ({
    __esModule: true,
    default: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Setup global beforeEach to always reset mocks
beforeEach(() => {
    jest.clearAllMocks();
});

// Create mockPrisma to be shared across tests
export const mockPrisma = {
    user: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn()
    },
    session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(() => ({ _avg: { duration: 600 } }))
    },
    event: {
        create: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn(() => ({ count: 2 })),
        count: jest.fn(),
        groupBy: jest.fn()
    },
    game: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    remoteConfig: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        update: jest.fn()
    },
    $disconnect: jest.fn()
};

// Mock PrismaClient constructor
(PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrisma as any);