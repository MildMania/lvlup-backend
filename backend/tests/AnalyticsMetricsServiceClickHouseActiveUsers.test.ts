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

describe('AnalyticsMetricsService ClickHouse active users read', () => {
  const originalFlag = process.env.ANALYTICS_READ_ACTIVE_USERS_FROM_CLICKHOUSE;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.clear();
    process.env.ANALYTICS_READ_ACTIVE_USERS_FROM_CLICKHOUSE = '1';
    mockClickHouse.isEnabled.mockReturnValue(true);
  });

  afterAll(() => {
    process.env.ANALYTICS_READ_ACTIVE_USERS_FROM_CLICKHOUSE = originalFlag;
  });

  it('uses ClickHouse path when enabled', async () => {
    const prismaMock: any = {
      $queryRaw: jest.fn(),
    };
    const service = new AnalyticsMetricsService(prismaMock);
    mockClickHouse.query.mockResolvedValue([
      { date: '2026-03-01', dau: 10, wau: 55, mau: 120 },
      { date: '2026-03-02', dau: 12, wau: 58, mau: 124 },
    ]);

    const data = await service.calculateActiveUsers(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z')
    );

    expect(mockClickHouse.query).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(data).toEqual([
      { date: '2026-03-01', dau: 10, wau: 55, mau: 120 },
      { date: '2026-03-02', dau: 12, wau: 58, mau: 124 },
    ]);
  });

  it('falls back to Postgres path when ClickHouse fails', async () => {
    const firstDay = new Date('2026-03-01T00:00:00.000Z');
    const secondDay = new Date('2026-03-02T00:00:00.000Z');
    const prismaMock: any = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { day: firstDay, dau: BigInt(7) },
          { day: secondDay, dau: BigInt(9) },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new AnalyticsMetricsService(prismaMock);
    mockClickHouse.query.mockRejectedValue(new Error('clickhouse unavailable'));

    const data = await service.calculateActiveUsers(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z')
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(data).toEqual([
      { date: '2026-03-01', dau: 7, wau: 0, mau: 0 },
      { date: '2026-03-02', dau: 9, wau: 0, mau: 0 },
    ]);
  });
});
