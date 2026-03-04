const mockClickHouse = {
  isEnabled: jest.fn(),
  query: jest.fn(),
};

jest.mock('../src/services/ClickHouseService', () => ({
  __esModule: true,
  default: mockClickHouse,
}));

import { AnalyticsService } from '../src/services/AnalyticsService';

describe('AnalyticsService ClickHouse events read', () => {
  const originalFlag = process.env.ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE = '1';
    mockClickHouse.isEnabled.mockReturnValue(true);
  });

  afterAll(() => {
    process.env.ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE = originalFlag;
  });

  it('reads events feed from ClickHouse when feature flag is enabled', async () => {
    const prismaMock: any = {
      event: { findMany: jest.fn() },
      revenue: { findMany: jest.fn() },
    };
    const service = new AnalyticsService(prismaMock);

    mockClickHouse.query
      .mockResolvedValueOnce([
        {
          id: 'evt_1',
          eventName: 'level_start',
          userId: 'u_1',
          sessionId: 's_1',
          propertiesJson: '{"level":1}',
          timestamp: '2026-03-02T10:00:00.000Z',
          serverReceivedAt: '2026-03-02T10:00:01.000Z',
          platform: 'ios',
          countryCode: 'US',
          appVersion: '1.0.0',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'rev_1',
          userId: 'u_1',
          sessionId: 's_1',
          revenueType: 'AD_IMPRESSION',
          revenueUSD: 0.1,
          currency: 'USD',
          timestamp: '2026-03-02T10:00:02.000Z',
          serverReceivedAt: '2026-03-02T10:00:03.000Z',
          platform: 'ios',
          countryCode: 'US',
          appVersion: '1.0.0',
        },
      ]);

    const result = await service.getEvents('game_1', 20, 0, 'desc');

    expect(mockClickHouse.query).toHaveBeenCalledTimes(2);
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
    expect(prismaMock.revenue.findMany).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0]?.isRevenueEvent).toBe(true);
  });

  it('falls back to Postgres when ClickHouse read fails', async () => {
    const prismaMock: any = {
      event: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'evt_pg_1',
            eventName: 'level_start',
            userId: 'u_1',
            sessionId: 's_1',
            properties: { level: 1 },
            timestamp: new Date('2026-03-02T10:00:00.000Z'),
            eventUuid: null,
            clientTs: null,
            serverReceivedAt: new Date('2026-03-02T10:00:01.000Z'),
            platform: 'ios',
            osVersion: null,
            manufacturer: null,
            device: null,
            deviceId: null,
            appVersion: '1.0.0',
            appBuild: null,
            sdkVersion: null,
            connectionType: null,
            sessionNum: null,
            countryCode: 'US',
          },
        ]),
      },
      revenue: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AnalyticsService(prismaMock);
    mockClickHouse.query.mockRejectedValue(new Error('clickhouse down'));

    const result = await service.getEvents('game_1', 20, 0, 'desc');

    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('evt_pg_1');
    expect(result[0]?.isRevenueEvent).toBe(false);
  });
});

