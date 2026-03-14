# Postgres Egress Attribution Runbook

Use this to find exactly which process causes public Postgres egress spikes.

## Goal
Attribute high egress to one or more sources:
- API service
- local worker (jobs/sync)
- external DB tools/scripts

## 1) Label each client with `application_name`

Set `application_name` in every Postgres connection string.

### API server
Use `DATABASE_URL` with:

```text
...?application_name=lvlup_api
```

### Local worker (jobs machine)
Use `DATABASE_URL` with:

```text
...?application_name=lvlup_worker
```

### External tools/scripts
Examples:
- DBeaver/pgAdmin: set startup parameter `application_name=dbeaver_manual`
- scripts: `application_name=analytics_export`

## 2) Restart clients
Restart API + worker + scripts/tools so new connections carry the label.

## 3) Baseline reset window
If available, reset statement stats right before a measurement window:

```sql
SELECT pg_stat_statements_reset();
```

Then measure for 30-60 minutes.

## 4) Attribution queries

### A) Current connections by source
```sql
SELECT
  usename,
  application_name,
  client_addr,
  state,
  COUNT(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1,2,3,4
ORDER BY connections DESC;
```

### B) Active long-running queries
```sql
SELECT
  now() - query_start AS runtime,
  usename,
  application_name,
  client_addr,
  state,
  LEFT(query, 300) AS query
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
ORDER BY query_start ASC;
```

### C) Top query shapes by rows/time (requires `pg_stat_statements`)
```sql
SELECT
  calls,
  total_exec_time,
  mean_exec_time,
  rows,
  LEFT(query, 220) AS query
FROM pg_stat_statements
ORDER BY rows DESC, total_exec_time DESC
LIMIT 50;
```

### D) OFFSET-heavy scans (common egress driver)
```sql
SELECT
  calls,
  total_exec_time,
  mean_exec_time,
  rows,
  LEFT(query, 220) AS query
FROM pg_stat_statements
WHERE query ILIKE '% ORDER BY % OFFSET %'
ORDER BY rows DESC
LIMIT 30;
```

## 5) Interpret results quickly

- Very high `rows` + `ORDER BY ... OFFSET` usually means expensive paging scans.
- Repeated hourly spikes at fixed minutes often map to cron jobs.
- If `application_name` is set, source is immediately visible.

## 6) Fast isolation test
Run 20-30 minute windows and compare egress trend:

1. Stop worker only
2. Stop dashboard/analytics traffic only
3. Close external DB tools only

The window where spikes disappear identifies the source.

## 7) Common fixes once source is known

### If worker is source
- Keep hourly jobs disabled unless needed.
- Keep only required sync tables in `CLICKHOUSE_SYNC_TABLES`.
- Avoid full-table page scans; use watermark/range reads.

### If API is source
- Disable ClickHouse read flags or expensive endpoints temporarily.
- Cap realtime/events pagination and avoid deep offset patterns.

### If external tools/scripts are source
- Stop or throttle export jobs.
- Replace deep OFFSET pagination with keyset/range pagination.

## 8) No `pg_stat_statements` fallback
If extension is unavailable, use:
- `pg_stat_activity` queries above
- per-client connection tracking
- process-level logs with request/job timestamps

This still lets you correlate spikes with specific clients/jobs.
