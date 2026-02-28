# ClickHouse Worker Setup (Other Machine)

This runbook explains how to enable the ClickHouse pilot sync on a separate local worker machine.

Important:
- ClickHouse sync code exists in branch: `codex-clickhouse-pilot-foundation`
- If the worker machine tracks `main`, switch it to that branch first.

## 1) Pull the correct branch on worker machine

From `backend/`:

```bash
git fetch origin
git checkout codex-clickhouse-pilot-foundation
git pull
npm install
```

## 2) Set worker environment variables

Use the same env source where `RUN_JOBS=true` is configured (for example `.worker.env` or PM2 env).

Minimum required:

```env
RUN_API=false
RUN_JOBS=true

ENABLE_CLICKHOUSE_PIPELINE=1
CLICKHOUSE_URL=https://<your-clickhouse-host>:8443
CLICKHOUSE_DATABASE=default
CLICKHOUSE_USER=<clickhouse-user>
CLICKHOUSE_PASSWORD=<clickhouse-password>
```

Recommended defaults:

```env
CLICKHOUSE_SYNC_TABLES=events,revenue,sessions,users
CLICKHOUSE_SYNC_BATCH_SIZE=10000
CLICKHOUSE_SYNC_MAX_BATCHES=5
CLICKHOUSE_SYNC_CRON=*/5 * * * *
CLICKHOUSE_HTTP_TIMEOUT_MS=15000
```

## 3) Restart worker process

If using PM2:

```bash
npm run worker:redeploy
```

or:

```bash
npm run worker:start
```

## 4) Run one manual sync cycle (sanity check)

```bash
npm run clickhouse:sync-once
```

Expected log:
- `[ClickHouseSync] ... synced ...`
- No auth/timeout errors.

## 5) Verify data landed

In ClickHouse console:

```sql
SELECT count() FROM events_raw;
SELECT count() FROM revenue_raw;
SELECT count() FROM sessions_raw;
SELECT count() FROM users_raw;
```

In Postgres (watermarks):

```sql
SELECT * FROM "analytics_sync_watermarks" ORDER BY "pipeline";
```

You should see `lastTs` and `lastId` advancing.

## 6) If sync does not start

Check:
1. Worker is actually running with `RUN_JOBS=true`.
2. `ENABLE_CLICKHOUSE_PIPELINE=1` is in the worker env (not only API env).
3. `CLICKHOUSE_URL`/credentials are correct.
4. Worker is on branch `codex-clickhouse-pilot-foundation`.

## 7) Rollback

To disable quickly:

```env
ENABLE_CLICKHOUSE_PIPELINE=0
```

Restart worker process.

