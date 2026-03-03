import { ClickHouseSyncService } from '../src/services/ClickHouseSyncService';
import clickHouseService from '../src/services/ClickHouseService';

jest.mock('../src/services/ClickHouseService', () => ({
  __esModule: true,
  default: {
    isEnabled: jest.fn(),
    command: jest.fn(),
    insertJsonEachRow: jest.fn(),
  },
}));

type MockPrisma = {
  $executeRawUnsafe: jest.Mock;
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
};

function createMockPrisma(): MockPrisma {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

describe('ClickHouseSyncService', () => {
  const mockedClickHouse = clickHouseService as unknown as {
    isEnabled: jest.Mock;
    command: jest.Mock;
    insertJsonEachRow: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLICKHOUSE_SYNC_TABLES = 'events,revenue,sessions,users';
    process.env.CLICKHOUSE_SYNC_BATCH_SIZE = '10000';
    process.env.CLICKHOUSE_SYNC_MAX_BATCHES = '5';
    mockedClickHouse.isEnabled.mockReturnValue(true);
    mockedClickHouse.command.mockResolvedValue(undefined);
    mockedClickHouse.insertJsonEachRow.mockResolvedValue(undefined);
  });

  it('uses epoch watermark when none exists and advances after first batch', async () => {
    process.env.CLICKHOUSE_SYNC_TABLES = 'events';
    const prisma = createMockPrisma();
    const service = new ClickHouseSyncService(prisma as any);

    const eventRow = {
      id: 'evt_1',
      gameId: 'game_1',
      userId: 'user_1',
      sessionId: 'sess_1',
      eventName: 'session_start',
      timestamp: new Date('2026-03-01T00:00:01.000Z'),
      serverReceivedAt: new Date('2026-03-01T00:00:02.000Z'),
      platform: 'ios',
      countryCode: 'US',
      appVersion: '1.0.0',
      levelFunnel: '',
      levelFunnelVersion: 0,
      propertiesJson: '{}',
    };

    prisma.$queryRaw
      .mockResolvedValueOnce([]) // watermark
      .mockResolvedValueOnce([eventRow]); // first batch

    await service.runSyncCycle();

    expect(mockedClickHouse.command).toHaveBeenCalledTimes(9);
    expect(mockedClickHouse.insertJsonEachRow).toHaveBeenCalledWith('events_raw', [
      expect.objectContaining({
        id: 'evt_1',
        timestamp: '2026-03-01T00:00:01.000Z',
        serverReceivedAt: '2026-03-01T00:00:02.000Z',
      }),
    ]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not write watermark or insert rows when batch is empty', async () => {
    process.env.CLICKHOUSE_SYNC_TABLES = 'events';
    const prisma = createMockPrisma();
    const service = new ClickHouseSyncService(prisma as any);

    prisma.$queryRaw
      .mockResolvedValueOnce([]) // watermark
      .mockResolvedValueOnce([]); // no rows

    await service.runSyncCycle();

    expect(mockedClickHouse.insertJsonEachRow).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('advances watermark across multiple batches', async () => {
    process.env.CLICKHOUSE_SYNC_TABLES = 'events';
    process.env.CLICKHOUSE_SYNC_BATCH_SIZE = '1';
    process.env.CLICKHOUSE_SYNC_MAX_BATCHES = '3';
    const prisma = createMockPrisma();
    const service = new ClickHouseSyncService(prisma as any);

    const first = {
      id: 'evt_1',
      gameId: 'game_1',
      userId: 'user_1',
      sessionId: null,
      eventName: 'a',
      timestamp: new Date('2026-03-01T00:00:01.000Z'),
      serverReceivedAt: new Date('2026-03-01T00:00:01.000Z'),
      platform: '',
      countryCode: '',
      appVersion: '',
      levelFunnel: '',
      levelFunnelVersion: 0,
      propertiesJson: '{}',
    };
    const second = {
      ...first,
      id: 'evt_2',
      serverReceivedAt: new Date('2026-03-01T00:00:02.000Z'),
    };

    prisma.$queryRaw
      .mockResolvedValueOnce([]) // watermark
      .mockResolvedValueOnce([first]) // batch 1
      .mockResolvedValueOnce([
        { lastTs: new Date('2026-03-01T00:00:01.000Z'), lastId: 'evt_1' },
      ]) // watermark
      .mockResolvedValueOnce([second]) // batch 2
      .mockResolvedValueOnce([
        { lastTs: new Date('2026-03-01T00:00:02.000Z'), lastId: 'evt_2' },
      ]) // watermark
      .mockResolvedValueOnce([]); // batch 3

    await service.runSyncCycle();

    expect(mockedClickHouse.insertJsonEachRow).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('filters unsupported sync tables from env configuration', async () => {
    process.env.CLICKHOUSE_SYNC_TABLES = 'invalid,users,bad';
    const prisma = createMockPrisma();
    const service = new ClickHouseSyncService(prisma as any);

    prisma.$queryRaw
      .mockResolvedValueOnce([]) // users watermark
      .mockResolvedValueOnce([
        {
          id: 'u_1',
          gameId: 'game_1',
          externalId: 'ext_1',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          platform: '',
          country: '',
          version: '',
        },
      ]);

    await service.runSyncCycle();

    expect(mockedClickHouse.insertJsonEachRow).toHaveBeenCalledTimes(1);
    expect(mockedClickHouse.insertJsonEachRow).toHaveBeenCalledWith('users_raw', [
      expect.objectContaining({
        id: 'u_1',
        createdAt: '2026-03-01T00:00:00.000Z',
      }),
    ]);
  });
});
