import { AnalyticsService } from '../src/services/AnalyticsService';
import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger';
import { EventData, BatchEventData, UserProfile, SessionData } from '../src/types/api';
import { mockPrisma } from './setup';

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create a fresh instance of the service for each test with the mockPrisma
    analyticsService = new AnalyticsService(mockPrisma as unknown as PrismaClient);
  });

  describe('getOrCreateUser', () => {
    it('should create a new user if it does not exist', async () => {
      // Arrange
      const gameId = 'game123';
      const userProfile: UserProfile = {
        externalId: 'ext123',
        deviceId: 'device123',
        platform: 'iOS',
        version: '1.0.0',
        country: 'US',
        language: 'en'
      };

      const mockUser = {
        id: 'user123',
        gameId,
        externalId: userProfile.externalId,
        deviceId: userProfile.deviceId,
        platform: userProfile.platform,
        version: userProfile.version,
        country: userProfile.country,
        language: userProfile.language,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.user.upsert.mockResolvedValue(mockUser);

      // Act
      const result = await analyticsService.getOrCreateUser(gameId, userProfile);

      // Assert
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
        where: {
          gameId_externalId: {
            gameId,
            externalId: userProfile.externalId
          }
        },
        update: expect.objectContaining({
          deviceId: userProfile.deviceId,
          platform: userProfile.platform
        }),
        create: expect.objectContaining({
          gameId,
          externalId: userProfile.externalId,
          deviceId: userProfile.deviceId,
          platform: userProfile.platform
        })
      });

      expect(result).toEqual(mockUser);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      // Arrange
      const gameId = 'game123';
      const userProfile: UserProfile = { externalId: 'ext123' };

      mockPrisma.user.upsert.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(analyticsService.getOrCreateUser(gameId, userProfile)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('startSession', () => {
    it('should create a new session', async () => {
      // Arrange
      const gameId = 'game123';
      const userId = 'user123';
      const sessionData: SessionData = {
        startTime: '2023-09-22T10:00:00Z',
        platform: 'Android',
        version: '2.1.0'
      };

      const mockSession = {
        id: 'mocked-uuid-value',
        gameId,
        userId,
        startTime: new Date(sessionData.startTime),
        endTime: null,
        duration: null,
        platform: sessionData.platform,
        version: sessionData.version
      };

      mockPrisma.session.create.mockResolvedValue(mockSession);

      // Act
      const result = await analyticsService.startSession(gameId, userId, sessionData);

      // Assert
      expect(mockPrisma.session.create).toHaveBeenCalled();
      // Verify the call had the right gameId, userId, and other non-uuid parameters
      const createCall = mockPrisma.session.create.mock.calls[0][0];
      expect(createCall.data.gameId).toEqual(gameId);
      expect(createCall.data.userId).toEqual(userId);
      expect(createCall.data.platform).toEqual(sessionData.platform);
      expect(createCall.data.version).toEqual(sessionData.version);

      expect(result).toEqual(mockSession);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('should update session with end time and duration', async () => {
      // Arrange
      const sessionId = 'session123';
      const endTime = '2023-09-22T11:30:00Z';
      const startTime = '2023-09-22T10:00:00Z';

      mockPrisma.session.findUnique.mockResolvedValue({
        id: sessionId,
        startTime: new Date(startTime),
        endTime: null,
        duration: null,
        gameId: 'game123',
        userId: 'user123',
        platform: 'iOS',
        version: '1.0.0'
      });

      mockPrisma.session.update.mockResolvedValue({
        id: sessionId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        duration: 5400, // 90 minutes in seconds
        gameId: 'game123',
        userId: 'user123',
        platform: 'iOS',
        version: '1.0.0'
      });

      // Act
      const result = await analyticsService.endSession(sessionId, endTime);

      // Assert
      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId }
      });

      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          endTime: new Date(endTime),
          duration: expect.any(Number)
        }
      });

      expect(result.endTime).toEqual(new Date(endTime));
      expect(result.duration).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const sessionId = 'nonexistent';
      const endTime = '2023-09-22T11:30:00Z';

      mockPrisma.session.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(analyticsService.endSession(sessionId, endTime)).rejects.toThrow('Session not found');
    });
  });

  describe('trackEvent', () => {
    it('should track a single event', async () => {
      // Arrange
      const gameId = 'game123';
      const userId = 'user123';
      const sessionId = 'session123';
      const eventData: EventData = {
        eventName: 'level_complete',
        properties: { level: 5, score: 1000 }
      };

      const mockEvent = {
        id: 'event123',
        gameId,
        userId,
        sessionId,
        eventName: eventData.eventName,
        properties: eventData.properties,
        timestamp: new Date()
      };

      mockPrisma.event.create.mockResolvedValue(mockEvent);

      // Act
      const result = await analyticsService.trackEvent(gameId, userId, sessionId, eventData);

      // Assert
      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: {
          gameId,
          userId,
          sessionId,
          eventName: eventData.eventName,
          properties: eventData.properties,
          timestamp: expect.any(Date)
        }
      });

      expect(result).toEqual(mockEvent);
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('trackBatchEvents', () => {
    it('should track multiple events in batch', async () => {
      // Arrange
      const gameId = 'game123';
      const batchData: BatchEventData = {
        userId: 'ext123',
        sessionId: 'session123',
        events: [
          {
            eventName: 'game_start',
            properties: { level: 1 },
            timestamp: '2023-09-22T10:05:00Z'
          },
          {
            eventName: 'level_complete',
            properties: { level: 1, score: 500 },
            timestamp: '2023-09-22T10:15:00Z'
          }
        ],
        deviceInfo: {
          platform: 'iOS',
          version: '1.0.0',
          deviceId: 'device123'
        }
      };

      const mockUser = {
        id: 'user123',
        externalId: batchData.userId,
        gameId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock user creation and batch event creation
      mockPrisma.user.upsert.mockResolvedValue(mockUser);
      // @ts-ignore - Type mismatch in mock
      mockPrisma.event.createMany.mockResolvedValue({ count: batchData.events.length });

      // Act
      const result = await analyticsService.trackBatchEvents(gameId, batchData);

      // Assert
      expect(mockPrisma.user.upsert).toHaveBeenCalled();
      expect(mockPrisma.event.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            gameId,
            userId: mockUser.id,
            sessionId: batchData.sessionId,
            eventName: 'game_start'
          }),
          expect.objectContaining({
            gameId,
            userId: mockUser.id,
            sessionId: batchData.sessionId,
            eventName: 'level_complete'
          })
        ]),
        skipDuplicates: true
      });

      expect(result.count).toEqual(batchData.events.length);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('getAnalytics', () => {
    it('should retrieve analytics data for a game', async () => {
      // Arrange
      const gameId = 'game123';
      const startDate = new Date('2023-09-01');
      const endDate = new Date('2023-09-30');

      mockPrisma.event.count.mockResolvedValue(1000);
      mockPrisma.user.count.mockResolvedValue(500);
      mockPrisma.session.count.mockResolvedValue(750);
      // @ts-ignore - Type mismatch in mock
      mockPrisma.session.aggregate.mockResolvedValue({
        _avg: { duration: 600 } // 10 minutes in seconds
      });
      mockPrisma.event.groupBy.mockResolvedValue([
        { eventName: 'game_start', _count: { eventName: 500 } },
        { eventName: 'level_complete', _count: { eventName: 300 } },
        { eventName: 'purchase', _count: { eventName: 50 } }
      ]);

      // Act
      const result = await analyticsService.getAnalytics(gameId, startDate, endDate);

      // Assert
      expect(mockPrisma.event.count).toHaveBeenCalledWith({
        where: {
          gameId,
          timestamp: { gte: startDate, lte: endDate }
        }
      });

      expect(result).toEqual({
        totalEvents: 1000,
        uniqueUsers: 500,
        totalSessions: 750,
        avgSessionDuration: 600,
        topEvents: [
          { name: 'game_start', count: 500 },
          { name: 'level_complete', count: 300 },
          { name: 'purchase', count: 50 }
        ]
      });
    });

    it('should handle errors', async () => {
      // Arrange
      const gameId = 'game123';
      const startDate = new Date('2023-09-01');
      const endDate = new Date('2023-09-30');

      // @ts-ignore - Mocking error case
      mockPrisma.event.count.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(analyticsService.getAnalytics(gameId, startDate, endDate)).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});