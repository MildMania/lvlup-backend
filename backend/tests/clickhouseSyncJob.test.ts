const mockSchedule = jest.fn();
const mockWithJobAdvisoryLock = jest.fn(async (_job: string, run: () => Promise<void>) => run());
const mockRunSyncCycle = jest.fn();
const mockIsEnabled = jest.fn();
const mockPing = jest.fn();
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: mockSchedule,
  },
}));

jest.mock('../src/jobs/advisoryLock', () => ({
  withJobAdvisoryLock: mockWithJobAdvisoryLock,
}));

jest.mock('../src/services/ClickHouseSyncService', () => ({
  __esModule: true,
  default: {
    isEnabled: mockIsEnabled,
    runSyncCycle: mockRunSyncCycle,
  },
}));

jest.mock('../src/services/ClickHouseService', () => ({
  __esModule: true,
  default: {
    ping: mockPing,
  },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

import { runClickHouseSyncOnce, startClickHouseSyncJob } from '../src/jobs/clickhouseSync';

describe('clickhouseSync job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEnabled.mockReturnValue(true);
    mockPing.mockResolvedValue(true);
    mockRunSyncCycle.mockResolvedValue(undefined);
  });

  it('skips sync when pipeline is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);

    await runClickHouseSyncOnce();

    expect(mockPing).not.toHaveBeenCalled();
    expect(mockRunSyncCycle).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[ClickHouseSync] Skipped (ENABLE_CLICKHOUSE_PIPELINE not enabled)'
    );
  });

  it('skips sync when clickhouse health check fails', async () => {
    mockPing.mockResolvedValue(false);

    await runClickHouseSyncOnce();

    expect(mockRunSyncCycle).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[ClickHouseSync] ClickHouse unavailable, skipping cycle');
  });

  it('runs sync cycle when enabled and healthy', async () => {
    await runClickHouseSyncOnce();
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });

  it('schedules cron job and executes wrapped cycle', async () => {
    process.env.CLICKHOUSE_SYNC_CRON = '*/7 * * * *';
    let scheduledHandler: (() => Promise<void>) | null = null;
    mockSchedule.mockImplementation((_expr: string, cb: () => Promise<void>) => {
      scheduledHandler = cb;
      return {} as any;
    });

    startClickHouseSyncJob();

    expect(mockSchedule).toHaveBeenCalledWith('*/7 * * * *', expect.any(Function));
    expect(scheduledHandler).not.toBeNull();
    await scheduledHandler!();
    expect(mockWithJobAdvisoryLock).toHaveBeenCalledWith('clickhouse-sync', expect.any(Function));
  });
});
