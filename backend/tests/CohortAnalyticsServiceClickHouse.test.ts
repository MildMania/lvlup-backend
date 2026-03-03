const mockClickHouse = {
  isEnabled: jest.fn(),
  query: jest.fn(),
};

jest.mock('../src/services/ClickHouseService', () => ({
  __esModule: true,
  default: mockClickHouse,
}));

import { CohortAnalyticsService } from '../src/services/CohortAnalyticsService';

describe('CohortAnalyticsService ClickHouse read', () => {
  const originalFlag = process.env.ANALYTICS_READ_COHORT_FROM_CLICKHOUSE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANALYTICS_READ_COHORT_FROM_CLICKHOUSE = '1';
    mockClickHouse.isEnabled.mockReturnValue(true);
  });

  afterAll(() => {
    process.env.ANALYTICS_READ_COHORT_FROM_CLICKHOUSE = originalFlag;
  });

  it('uses ClickHouse path for cohort retention when enabled', async () => {
    const prismaMock: any = {
      $queryRaw: jest.fn(),
      $disconnect: jest.fn(),
    };

    mockClickHouse.query.mockResolvedValue([
      {
        installDate: '2026-03-01',
        dayIndex: 0,
        cohortSize: 100,
        retainedUsers: 100,
        retainedLevelCompletes: 250,
      },
      {
        installDate: '2026-03-01',
        dayIndex: 1,
        cohortSize: 100,
        retainedUsers: 40,
        retainedLevelCompletes: 90,
      },
    ]);

    const service = new CohortAnalyticsService(prismaMock);
    const data = await service.calculateCohortRetention(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z'),
      { days: [0, 1] }
    );

    expect(mockClickHouse.query).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      installDate: '2026-03-01',
      installCount: 100,
    });
    expect(data[0]?.retentionByDay[1]).toBe(40);
  });

  it('falls back to Postgres when ClickHouse fails', async () => {
    const prismaMock: any = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          installDate: new Date('2026-03-01T00:00:00.000Z'),
          dayIndex: 0,
          cohortSize: BigInt(100),
          retainedUsers: BigInt(100),
          retainedLevelCompletes: BigInt(250),
        },
        {
          installDate: new Date('2026-03-01T00:00:00.000Z'),
          dayIndex: 1,
          cohortSize: BigInt(100),
          retainedUsers: BigInt(35),
          retainedLevelCompletes: BigInt(80),
        },
      ]),
      $disconnect: jest.fn(),
    };

    mockClickHouse.query.mockRejectedValue(new Error('clickhouse unavailable'));

    const service = new CohortAnalyticsService(prismaMock);
    const data = await service.calculateCohortRetention(
      'game_1',
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-02T23:59:59.999Z'),
      { days: [0, 1] }
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(data[0]?.retentionByDay[1]).toBe(35);
  });
});
