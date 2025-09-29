import { EngagementMetricsService } from '../src/services/EngagementMetricsService';
import { PrismaClient } from '@prisma/client';

// Mock the Prisma client
// Mock functions
const mockSessionGroupBy = jest.fn();
const mockSessionFindMany = jest.fn();

// Create a mock Prisma client
const mockPrismaClient = {
    session: {
        groupBy: mockSessionGroupBy,
        findMany: mockSessionFindMany,
    }
} as unknown as PrismaClient;

describe('EngagementMetricsService', () => {
    let engagementMetricsService: EngagementMetricsService;

    beforeEach(() => {
        jest.clearAllMocks();
        engagementMetricsService = new EngagementMetricsService(mockPrismaClient);
    });

    describe('calculateSessionCounts', () => {
        it('should calculate session counts correctly', async () => {
            // Setup mock data
            const mockGroupByResult = [
                { userId: 'user1', _count: { id: 3 } },
                { userId: 'user2', _count: { id: 1 } },
                { userId: 'user3', _count: { id: 7 } }
            ];

            // Configure mock to return our test data
            mockSessionGroupBy.mockResolvedValue(mockGroupByResult);

            // Call the method
            const startDate = new Date('2025-09-01');
            const endDate = new Date('2025-09-01'); // Same day for simplicity
            const gameId = 'game123';

            const result = await engagementMetricsService.calculateSessionCounts(gameId, startDate, endDate);

            // Assertions
            expect(result).toHaveLength(1); // One day of data
            if (result[0]) {
                expect(result[0].sessionCounts.average).toBeCloseTo(3.67, 1); // (3+1+7)/3 ≈ 3.67
            }
            expect(mockSessionGroupBy).toHaveBeenCalledTimes(1);
        });
    });

    describe('calculateSessionLengths', () => {
        it('should calculate session lengths correctly', async () => {
            // Setup mock data
            const mockFindManyResult = [
                { userId: 'user1', duration: 300 }, // 5 minutes
                { userId: 'user1', duration: 600 }, // 10 minutes
                { userId: 'user2', duration: 900 }, // 15 minutes
            ];

            // Configure mock to return our test data
            mockSessionFindMany.mockResolvedValue(mockFindManyResult);

            // Call the method
            const startDate = new Date('2025-09-01');
            const endDate = new Date('2025-09-01'); // Same day for simplicity
            const gameId = 'game123';

            const result = await engagementMetricsService.calculateSessionLengths(gameId, startDate, endDate);

            // Assertions
            expect(result).toHaveLength(1); // One day of data
            if (result[0]) {
                expect(result[0].sessionLength.average).toBeCloseTo(600); // (300+600+900)/3 = 600
                expect(result[0].sessionLength.total).toBe(1800); // 300+600+900 = 1800
            }
            expect(mockSessionFindMany).toHaveBeenCalledTimes(1);
        });
    });
});