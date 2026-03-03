const mockClickHouse = {
  isEnabled: jest.fn(),
  query: jest.fn(),
};

jest.mock('../src/services/ClickHouseService', () => ({
  __esModule: true,
  default: mockClickHouse,
}));

import { AnalyticsMetricsService } from '../src/services/AnalyticsMetricsService';
import { cache } from '../src/utils/simpleCache';

describe('AnalyticsMetricsService ClickHouse playtime read', () => {
  const originalFlag = process.env.ANALYTICS_READ_PLAYTIME_FROM_CLICKHOUSE;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.clear();
    process.env.ANALYTICS_READ_PLAYTIME_FROM_CLICKHOUSE = '1';
    mockClickHouse.isEnabled.mockReturnValue(true);
  });

  afterAll(() => {
    process.env.ANALYTICS_READ_PLAYTIME_FROM_CLICKHOUSE = originalFlag;
  });

  it('uses ClickHouse path when enabled', async () => {
    const prismaMock: any = {
      $queryRaw: jest.fn(),
    };
    const service = new AnalyticsMetricsService(prismaMock);

    mockClickHouse.query.mockResolvedValue([
      { date: '2026-03-01', total_sessions: 20, unique_users: 10, total_duration: 5000 },
      { date: '2026-03-02', total_sessions: 12, unique_users: 6, total_duration: 3600 },
    ]);

    const data = await service.calculatePlaytimeMetrics(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z')
    );

    expect(mockClickHouse.query).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(data).toEqual([
      { date: '2026-03-01', avgSessionDuration: 250, totalPlaytime: 500, sessionsPerUser: 2 },
      { date: '2026-03-02', avgSessionDuration: 300, totalPlaytime: 600, sessionsPerUser: 2 },
    ]);
  });

  it('falls back to Postgres path when ClickHouse fails', async () => {
    const firstDay = new Date('2026-03-01T00:00:00.000Z');
    const secondDay = new Date('2026-03-02T00:00:00.000Z');

    const prismaMock: any = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          day: firstDay,
          total_sessions: BigInt(20),
          unique_users: BigInt(10),
          total_duration: BigInt(5000),
        },
        {
          day: secondDay,
          total_sessions: BigInt(12),
          unique_users: BigInt(6),
          total_duration: BigInt(3600),
        },
      ]),
    };
    const service = new AnalyticsMetricsService(prismaMock);

    mockClickHouse.query.mockRejectedValue(new Error('clickhouse unavailable'));

    const data = await service.calculatePlaytimeMetrics(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z')
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(data).toEqual([
      { date: '2026-03-01', avgSessionDuration: 250, totalPlaytime: 500, sessionsPerUser: 2 },
      { date: '2026-03-02', avgSessionDuration: 300, totalPlaytime: 600, sessionsPerUser: 2 },
    ]);
  });
});
