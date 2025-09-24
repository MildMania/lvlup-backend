import { AnalyticsMetricsService } from '../src/services/AnalyticsMetricsService';
import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger';
import { mockPrisma } from './setup';

describe('AnalyticsMetricsService', () => {
  let metricsService: AnalyticsMetricsService;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create a fresh instance of the service for each test
    metricsService = new AnalyticsMetricsService();
  });

  describe('calculateRetention', () => {
    it('should calculate retention rates for different days', async () => {
      // Arrange
      const gameId = 'game123';
      const startDate = new Date('2023-09-01');
      const endDate = new Date('2023-09-30');

      // Mock user data
      const mockUsers = [
        { id: 'user1', externalId: 'ext1', createdAt: new Date('2023-09-05') },
        { id: 'user2', externalId: 'ext2', createdAt: new Date('2023-09-05') },
        { id: 'user3', externalId: 'ext3', createdAt: new Date('2023-09-05') },
        { id: 'user4', externalId: 'ext4', createdAt: new Date('2023-09-05') }
      ];

      // For simplicity, we'll say:
      // - user1 came back on day 1, 3, 7
      // - user2 came back on day 1 only
      // - user3 came back on day 3, 7, 14
      // - user4 didn't come back

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      // Day 1 retention: users 1, 2, and 3 returned
      mockPrisma.event.findFirst.mockImplementation(async (args: any) => {
        const userId = args.where.userId;
        const date = args.where.timestamp.gte;

        // Day 1 after registration
        if (date.getDate() === 6) { // Sept 5 + 1 day = Sept 6
          return userId === 'user1' || userId === 'user2' || userId === 'user3' ? { id: 'event' } : null;
        }
        // Day 3 after registration
        else if (date.getDate() === 8) { // Sept 5 + 3 days = Sept 8
          return userId === 'user1' || userId === 'user3' ? { id: 'event' } : null;
        }
        // Day 7 after registration
        else if (date.getDate() === 12) { // Sept 5 + 7 days = Sept 12
          return userId === 'user1' || userId === 'user3' ? { id: 'event' } : null;
        }
        // Day 14 after registration
        else if (date.getDate() === 19) { // Sept 5 + 14 days = Sept 19
          return userId === 'user3' ? { id: 'event' } : null;
        }
        // Day 30 after registration
        else {
          return null; // No one returned after 30 days
        }
      });

      // Act
      const result = await metricsService.calculateRetention(gameId, startDate, endDate);

      // Assert
      expect(result).toHaveLength(5); // 5 different retention days

      // Day 1: 3 out of 4 users returned (75%)
      expect(result[0]).toEqual({
        day: 1,
        count: 3,
        percentage: 75
      });

      // Day 3: 2 out of 4 users returned (50%)
      expect(result[1]).toEqual({
        day: 3,
        count: 2,
        percentage: 50
      });

      // Day 7: 2 out of 4 users returned (50%)
      expect(result[2]).toEqual({
        day: 7,
        count: 2,
        percentage: 50
      });

      // Day 14: 1 out of 4 users returned (25%)
      expect(result[3]).toEqual({
        day: 14,
        count: 1,
        percentage: 25
      });

      // Day 30: 0 out of 4 users returned (0%)
      expect(result[4]).toEqual({
        day: 30,
        count: 0,
        percentage: 0
      });

      expect(logger.info).toHaveBeenCalled();
    });

    it('should return empty array if no users found', async () => {
      // Arrange
      mockPrisma.user.findMany.mockResolvedValue([]);

      // Act
      const result = await metricsService.calculateRetention('game123', new Date(), new Date());

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('calculateActiveUsers', () => {
    it('should calculate DAU, WAU, and MAU for each day', async () => {
      // Arrange
      const gameId = 'game123';
      const startDate = new Date('2023-09-01');
      const endDate = new Date('2023-09-03'); // 3 days for simplicity

      // Set up mocks to return fixed values
      // First, reset the mock to clear any previous mock implementations
      mockPrisma.event.groupBy.mockReset();

      // Then set it up to return different results each time it's called
      // The first three calls will be for DAU for each day
      mockPrisma.event.groupBy.mockResolvedValueOnce([...Array(5)].map(() => ({ userId: 'user1' })))  // DAU for day 1
        .mockResolvedValueOnce([...Array(8)].map(() => ({ userId: 'user2' })))  // DAU for day 2
        .mockResolvedValueOnce([...Array(3)].map(() => ({ userId: 'user3' })))  // DAU for day 3
        .mockResolvedValueOnce([...Array(10)].map(() => ({ userId: 'user4' }))) // WAU for day 1
        .mockResolvedValueOnce([...Array(15)].map(() => ({ userId: 'user5' }))) // WAU for day 2
        .mockResolvedValueOnce([...Array(12)].map(() => ({ userId: 'user6' }))) // WAU for day 3
        .mockResolvedValueOnce([...Array(20)].map(() => ({ userId: 'user7' }))) // MAU for day 1
        .mockResolvedValueOnce([...Array(25)].map(() => ({ userId: 'user8' }))) // MAU for day 2
        .mockResolvedValueOnce([...Array(22)].map(() => ({ userId: 'user9' }))); // MAU for day 3

      // Act
      const result = await metricsService.calculateActiveUsers(gameId, startDate, endDate);

      // Assert
      expect(result).toHaveLength(3); // 3 days

      // Just verify we get back an array with 3 elements (one for each day)
      expect(result).toHaveLength(3);

      // And verify the structure of the results
      for (const dayData of result) {
        expect(dayData).toHaveProperty('date');
        expect(dayData).toHaveProperty('dau');
        expect(dayData).toHaveProperty('wau');
        expect(dayData).toHaveProperty('mau');

        // Verify data types
        expect(typeof dayData.date).toBe('string');
        expect(typeof dayData.dau).toBe('number');
        expect(typeof dayData.wau).toBe('number');
        expect(typeof dayData.mau).toBe('number');
      }
    });
  });

  describe('calculatePlaytimeMetrics', () => {
    it('should calculate session metrics for each day', async () => {
      // Arrange
      const gameId = 'game123';
      const startDate = new Date('2023-09-01');
      const endDate = new Date('2023-09-03'); // 3 days for simplicity

      // Mock sessions data
      const mockSessions = [
        // Day 1 (Sept 1)
        [
          { userId: 'user1', duration: 300 }, // 5 min
          { userId: 'user1', duration: 600 }, // 10 min
          { userId: 'user2', duration: 900 }, // 15 min
          { userId: 'user3', duration: 1200 } // 20 min
        ],
        // Day 2 (Sept 2)
        [
          { userId: 'user1', duration: 400 }, // 6.7 min
          { userId: 'user2', duration: 500 }, // 8.3 min
          { userId: 'user3', duration: 600 }, // 10 min
          { userId: 'user4', duration: 700 }, // 11.7 min
          { userId: 'user5', duration: 800 } // 13.3 min
        ],
        // Day 3 (Sept 3)
        [
          { userId: 'user1', duration: 300 }, // 5 min
          { userId: 'user1', duration: 400 }, // 6.7 min
          { userId: 'user2', duration: 500 } // 8.3 min
        ]
      ];

      // Mock the findMany results for each day
      mockPrisma.session.findMany.mockImplementation(async (args: any) => {
        const date = args.where.startTime.gte;

        // Check which day we're querying based on the timestamp
        if (date.getDate() === 1) return mockSessions[0];
        if (date.getDate() === 2) return mockSessions[1];
        if (date.getDate() === 3) return mockSessions[2];

        return [];
      });

      // Act
      const result = await metricsService.calculatePlaytimeMetrics(gameId, startDate, endDate);

      // Assert
      expect(result).toHaveLength(3); // 3 days

      // Day 1: 4 sessions from 3 users, total 3000s, avg 750s, 1.33 sessions per user
      expect(result[0]).toEqual({
        date: '2023-09-01',
        avgSessionDuration: 750,
        totalPlaytime: 3000,
        sessionsPerUser: 4 / 3
      });

      // Day 2: 5 sessions from 5 users, total 3000s, avg 600s, 1 session per user
      expect(result[1]).toEqual({
        date: '2023-09-02',
        avgSessionDuration: 600,
        totalPlaytime: 3000,
        sessionsPerUser: 1
      });

      // Day 3: 3 sessions from 2 users, total 1200s, avg 400s, 1.5 sessions per user
      expect(result[2]).toEqual({
        date: '2023-09-03',
        avgSessionDuration: 400,
        totalPlaytime: 1200,
        sessionsPerUser: 1.5
      });
    });
  });
});