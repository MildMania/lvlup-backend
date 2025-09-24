import { PlayerJourneyService } from '../src/services/PlayerJourneyService';
import { PrismaClient } from '@prisma/client';

// Mock functions
const mockCheckpointFindMany = jest.fn();
const mockCheckpointCreate = jest.fn();
const mockPlayerCheckpointGroupBy = jest.fn();
const mockPlayerCheckpointFindMany = jest.fn();
const mockPlayerCheckpointFindUnique = jest.fn();
const mockPlayerCheckpointCreate = jest.fn();

// Create a mock Prisma client
const mockPrismaClient = {
    checkpoint: {
        findMany: mockCheckpointFindMany,
        create: mockCheckpointCreate
    },
    playerCheckpoint: {
        groupBy: mockPlayerCheckpointGroupBy,
        findMany: mockPlayerCheckpointFindMany,
        findUnique: mockPlayerCheckpointFindUnique,
        create: mockPlayerCheckpointCreate
    }
} as unknown as PrismaClient;

describe('PlayerJourneyService', () => {
    let playerJourneyService: PlayerJourneyService;

    beforeEach(() => {
        jest.clearAllMocks();
        playerJourneyService = new PlayerJourneyService(mockPrismaClient);
    });

    describe('createCheckpoint', () => {
        it('should create a checkpoint successfully', async () => {
            // Mock data
            const gameId = 'game123';
            const checkpointData = {
                name: 'Tutorial Complete',
                description: 'Player completed the tutorial',
                type: 'tutorial',
                tags: ['onboarding']
            };

            const mockCreatedCheckpoint = {
                id: 'checkpoint1',
                ...checkpointData,
                gameId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Configure mock
            mockCheckpointCreate.mockResolvedValue(mockCreatedCheckpoint);

            // Call the method
            const result = await playerJourneyService.createCheckpoint(gameId, checkpointData);

            // Assertions
            expect(result).toEqual(mockCreatedCheckpoint);
            expect(mockCheckpointCreate).toHaveBeenCalledTimes(1);
            expect(mockCheckpointCreate).toHaveBeenCalledWith({
                data: {
                    gameId,
                    name: checkpointData.name,
                    description: checkpointData.description,
                    type: checkpointData.type,
                    tags: checkpointData.tags,
                    order: undefined
                }
            });
        });
    });

    describe('getJourneyProgress', () => {
        it('should return journey progress data', async () => {
            // Mock data
            const gameId = 'game123';
            const startDate = new Date('2025-09-01');
            const endDate = new Date('2025-09-10');

            const mockCheckpoints = [
                { id: 'checkpoint1', name: 'Tutorial Started', type: 'tutorial', gameId },
                { id: 'checkpoint2', name: 'Tutorial Completed', type: 'tutorial', gameId }
            ];

            // Mock users who reached checkpoints
            const mockTotalUsers = [{ userId: 'user1' }, { userId: 'user2' }];

            // Mock users for specific checkpoint
            const mockUsersCheckpoint1 = [
                { userId: 'user1', timestamp: new Date('2025-09-02') },
                { userId: 'user2', timestamp: new Date('2025-09-03') }
            ];

            const mockUsersCheckpoint2 = [
                { userId: 'user1', timestamp: new Date('2025-09-05') }
            ];

            // Configure mocks
            mockCheckpointFindMany.mockResolvedValue(mockCheckpoints);
            mockPlayerCheckpointGroupBy.mockResolvedValue(mockTotalUsers);
            mockPlayerCheckpointFindMany
                .mockResolvedValueOnce(mockUsersCheckpoint1)
                .mockResolvedValueOnce(mockUsersCheckpoint2);

            // Call the method
            const result = await playerJourneyService.getJourneyProgress(gameId, startDate, endDate);

            // Assertions
            expect(result.totalUsers).toBe(2);
            expect(result.checkpoints).toHaveLength(2);
            expect(result.checkpoints?.[0]?.count).toBe(2); // Both users reached checkpoint 1
            expect(result.checkpoints?.[1]?.count).toBe(1); // Only one user reached checkpoint 2
            expect(result.checkpoints?.[0]?.percentage).toBe(100);
            expect(result.checkpoints?.[1]?.percentage).toBe(50);
        });
    });
});