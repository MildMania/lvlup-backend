import logger from '../utils/logger';

type ClickHouseQueryOptions = {
  timeoutMs?: number;
};

/**
 * Minimal ClickHouse HTTP client for pilot usage.
 * Uses JSONEachRow for reads and writes to keep implementation simple and explicit.
 */
export class ClickHouseService {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly database: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly defaultTimeoutMs: number;
  private readonly pingTimeoutMs: number;

  constructor() {
    this.baseUrl = (process.env.CLICKHOUSE_URL || '').replace(/\/+$/, '');
    this.database = process.env.CLICKHOUSE_DATABASE || 'default';
    this.username = process.env.CLICKHOUSE_USER || undefined;
    this.password = process.env.CLICKHOUSE_PASSWORD || undefined;
    this.defaultTimeoutMs = Number(process.env.CLICKHOUSE_HTTP_TIMEOUT_MS || 15000);
    this.pingTimeoutMs = Number(process.env.CLICKHOUSE_PING_TIMEOUT_MS || 30000);

    const pipelineEnabled = this.envTrue('ENABLE_CLICKHOUSE_PIPELINE');
    const aggregationJobsEnabled = this.envTrue('ENABLE_CLICKHOUSE_AGGREGATION_JOBS');
    const anyReadFlagEnabled = [
      'ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE',
      'ANALYTICS_READ_REVENUE_SUMMARY_FROM_CLICKHOUSE',
      'ANALYTICS_READ_ACTIVE_USERS_FROM_CLICKHOUSE',
      'ANALYTICS_READ_RETENTION_FROM_CLICKHOUSE',
      'ANALYTICS_READ_PLAYTIME_FROM_CLICKHOUSE',
      'ANALYTICS_READ_COHORT_FROM_CLICKHOUSE',
      'ANALYTICS_READ_LEVEL_FUNNEL_FROM_CLICKHOUSE'
    ].some((key) => this.envTrue(key));

    this.enabled = pipelineEnabled || aggregationJobsEnabled || anyReadFlagEnabled;
  }

  isEnabled(): boolean {
    return this.enabled && !!this.baseUrl;
  }

  private envTrue(key: string): boolean {
    const value = process.env[key];
    return value === '1' || value === 'true';
  }

  async ping(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const res = await this.request('SELECT 1 FORMAT JSONEachRow', undefined, {
        timeoutMs: this.pingTimeoutMs
      });
      return res.ok;
    } catch (error) {
      logger.error('[ClickHouse] Ping failed', error);
      return false;
    }
  }

  async command(sql: string, options?: ClickHouseQueryOptions): Promise<void> {
    if (!this.isEnabled()) return;
    const res = await this.request(sql, undefined, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[ClickHouse] Command failed: ${res.status} ${text}`);
    }
  }

  async query<T>(sql: string, options?: ClickHouseQueryOptions): Promise<T[]> {
    if (!this.isEnabled()) return [];
    const finalSql = /FORMAT\s+/i.test(sql) ? sql : `${sql} FORMAT JSONEachRow`;
    const res = await this.request(finalSql, undefined, options);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`[ClickHouse] Query failed: ${res.status} ${text}`);
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T);
  }

  async insertJsonEachRow(tableName: string, rows: Array<Record<string, any>>): Promise<void> {
    if (!this.isEnabled() || rows.length === 0) return;
    const query = `INSERT INTO ${tableName} FORMAT JSONEachRow`;
    const body = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
    const res = await this.request(query, body, {
      timeoutMs: Math.max(this.defaultTimeoutMs, 30000)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[ClickHouse] Insert failed (${tableName}): ${res.status} ${text}`);
    }
  }

  private async request(
    query: string,
    body?: string,
    options?: ClickHouseQueryOptions
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const auth = this.username
        ? `Basic ${Buffer.from(`${this.username}:${this.password || ''}`).toString('base64')}`
        : null;

      const url = `${this.baseUrl}/?database=${encodeURIComponent(this.database)}`;
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          ...(auth ? { Authorization: auth } : {})
        },
        body: body ? `${query}\n${body}` : query,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export default new ClickHouseService();
