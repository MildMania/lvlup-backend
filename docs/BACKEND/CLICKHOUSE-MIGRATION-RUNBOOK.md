# ClickHouse Migration Runbook (Step-by-Step, Local Worker)

This runbook is designed for your current setup:

- API service in Railway
- Aggregation/sync worker on your local machine
- Postgres remains source of truth
- ClickHouse is added as analytics read engine

It is command-first and includes exact SQL/validation.

---

## 0) Preconditions

1. You already created a ClickHouse Cloud service.
2. You have these values:
   - `CLICKHOUSE_URL` (HTTP endpoint base, example: `https://<host>:8443`)
   - `CLICKHOUSE_DATABASE` (example: `lvlup`)
   - `CLICKHOUSE_USER`
   - `CLICKHOUSE_PASSWORD`
3. Local worker machine can reach:
   - Railway Postgres public URL
   - ClickHouse Cloud endpoint

---

## 1) Update code on local machine

> Run from your worker machine terminal.

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend
git fetch origin
git checkout main
git pull --ff-only
```

The ClickHouse pilot code currently lives on branch:

- `codex-clickhouse-pilot-foundation`

Bring it to `main` on local machine:

```bash
git cherry-pick 6912d46
```

If cherry-pick conflicts:

```bash
git cherry-pick --abort
git checkout codex-clickhouse-pilot-foundation
git pull --ff-only
git checkout main
git merge --no-ff codex-clickhouse-pilot-foundation
```

Then install/build:

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend
npm install
npm run build
```

---

## 2) Create ClickHouse database and raw tables

Open ClickHouse SQL console and run:

```sql
CREATE DATABASE IF NOT EXISTS lvlup;
```

Switch to that DB and run:

```sql
CREATE TABLE IF NOT EXISTS events_raw (
  id String,
  gameId String,
  userId String,
  sessionId Nullable(String),
  eventName String,
  timestamp DateTime64(3, 'UTC'),
  serverReceivedAt DateTime64(3, 'UTC'),
  platform String,
  countryCode String,
  appVersion String,
  levelFunnel String,
  levelFunnelVersion Int32,
  propertiesJson String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(serverReceivedAt)
ORDER BY (gameId, serverReceivedAt, id);

CREATE TABLE IF NOT EXISTS revenue_raw (
  id String,
  gameId String,
  userId String,
  sessionId Nullable(String),
  revenueType String,
  revenueUSD Float64,
  currency String,
  timestamp DateTime64(3, 'UTC'),
  serverReceivedAt DateTime64(3, 'UTC'),
  platform String,
  countryCode String,
  appVersion String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(serverReceivedAt)
ORDER BY (gameId, serverReceivedAt, id);

CREATE TABLE IF NOT EXISTS sessions_raw (
  id String,
  gameId String,
  userId String,
  startTime DateTime64(3, 'UTC'),
  endTime Nullable(DateTime64(3, 'UTC')),
  lastHeartbeat Nullable(DateTime64(3, 'UTC')),
  duration Nullable(Int32),
  platform String,
  countryCode String,
  version String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(startTime)
ORDER BY (gameId, startTime, id);

CREATE TABLE IF NOT EXISTS users_raw (
  id String,
  gameId String,
  externalId String,
  createdAt DateTime64(3, 'UTC'),
  platform String,
  country String,
  version String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(createdAt)
ORDER BY (gameId, createdAt, id);
```

> If you prefer a different DB name, replace `lvlup` and set `CLICKHOUSE_DATABASE` accordingly.

---

## 3) Configure worker env (`.worker.env`)

Create/update `backend/.worker.env`:

```bash
cat > /Users/emre/Desktop/MM-Projects/lvlup-backend/backend/.worker.env <<'EOF'
RUN_API=false
RUN_JOBS=true
DATABASE_URL=<RAILWAY_POSTGRES_PUBLIC_URL>

# Keep hourly jobs off
ENABLE_LEVEL_METRICS_HOURLY=0
ENABLE_ACTIVE_USERS_HOURLY=0
ENABLE_COHORT_HOURLY=0
ENABLE_MONETIZATION_HOURLY=0
LEVEL_CHURN_HOURLY_REFRESH=0

# Chunked daily aggregations (lower memory)
LEVEL_METRICS_DAILY_CHUNKED=1
ACTIVE_USERS_DAILY_CHUNKED=1
MONETIZATION_DAILY_CHUNKED=1
COHORT_DAYINDEX_CHUNK_SIZE=8
AGGREGATION_PAUSE_MS=0
AGGREGATION_FORCE_GC=0

# ClickHouse pipeline
ENABLE_CLICKHOUSE_PIPELINE=1
CLICKHOUSE_URL=<CLICKHOUSE_HTTP_URL>
CLICKHOUSE_DATABASE=lvlup
CLICKHOUSE_USER=<CLICKHOUSE_USER>
CLICKHOUSE_PASSWORD=<CLICKHOUSE_PASSWORD>
CLICKHOUSE_HTTP_TIMEOUT_MS=30000
CLICKHOUSE_SYNC_BATCH_SIZE=10000
CLICKHOUSE_SYNC_MAX_BATCHES=10
CLICKHOUSE_SYNC_TABLES=events,revenue,sessions,users
CLICKHOUSE_SYNC_CRON=*/5 * * * *

# Optional tracing
ANALYTICS_TRACE=0
EOF
```

---

## 4) Start/restart worker

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend
npm run worker:redeploy
```

Verify process is healthy and jobs started:

```bash
pm2 logs lvlup-worker --lines 200
```

You should see ClickHouse sync job init lines.

---

## 5) Initialize/validate Postgres watermark table

The sync service will auto-create:

- `analytics_sync_watermarks`

Validate in Postgres:

```sql
SELECT * FROM "analytics_sync_watermarks" ORDER BY "updatedAt" DESC LIMIT 20;
```

Initially may be empty until first sync cycle runs.

---

## 6) Run manual ClickHouse sync cycle

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend
npm run clickhouse:sync-once
```

Run it a few times for initial catch-up:

```bash
for i in {1..10}; do
  npm run clickhouse:sync-once || break
  sleep 2
done
```

---

## 7) Validate row movement (Postgres vs ClickHouse)

### 7.1 Events count by day (UTC)

Postgres:

```sql
SELECT date_trunc('day', "serverReceivedAt")::date AS d, COUNT(*) AS c
FROM "events"
WHERE "serverReceivedAt" >= now() - interval '3 day'
GROUP BY 1
ORDER BY 1;
```

ClickHouse:

```sql
SELECT toDate(serverReceivedAt) AS d, count() AS c
FROM events_raw
WHERE serverReceivedAt >= now() - INTERVAL 3 DAY
GROUP BY d
ORDER BY d;
```

### 7.2 Revenue count by day (UTC)

Postgres:

```sql
SELECT date_trunc('day', "serverReceivedAt")::date AS d, COUNT(*) AS c
FROM "revenue"
WHERE "serverReceivedAt" >= now() - interval '3 day'
GROUP BY 1
ORDER BY 1;
```

ClickHouse:

```sql
SELECT toDate(serverReceivedAt) AS d, count() AS c
FROM revenue_raw
WHERE serverReceivedAt >= now() - INTERVAL 3 DAY
GROUP BY d
ORDER BY d;
```

### 7.3 Watermark progress

```sql
SELECT "pipeline", "lastTs", "lastId", "updatedAt"
FROM "analytics_sync_watermarks"
ORDER BY "updatedAt" DESC;
```

---

## 8) Keep sync running in cron mode

With env set, the worker runs sync every 5 minutes (`CLICKHOUSE_SYNC_CRON`).

Monitor with:

```bash
pm2 logs lvlup-worker --lines 200
```

Look for:

- `[ClickHouseSync] <table>: synced N rows in ...`
- No repeated `ClickHouse unavailable` messages.

---

## 9) Shadow-read validation (before routing real endpoints)

Do this for one heavy endpoint/query pattern:

1. Keep API responses from Postgres.
2. Run equivalent ClickHouse query manually.
3. Compare outputs for same game/date/filter.
4. Accept if diff is zero (or explained by in-flight sync delay).

Recommended first target:

- Events list counts and simple aggregates (`eventName`, `day`).

---

## 10) Controlled cutover (read path)

When validation passes:

1. Add endpoint-level feature flag in API code (if not already merged):
   - e.g. `ANALYTICS_READ_EVENTS_FROM_CLICKHOUSE=1`
2. Enable one endpoint at a time.
3. Compare dashboard values with Postgres baseline.
4. Move next endpoint only after parity confirmed.

---

## 11) Rollback (instant)

If anything looks wrong:

1. Disable pipeline quickly on worker:

```bash
pm2 set lvlup-worker:ENABLE_CLICKHOUSE_PIPELINE 0
pm2 restart lvlup-worker
```

Or edit `.worker.env` and redeploy worker.

2. Keep API reads on Postgres.
3. Do not delete ClickHouse tables; fix and retry later.

---

## 12) Troubleshooting

### `npm run clickhouse:sync-once` says skipped

Check:

- `ENABLE_CLICKHOUSE_PIPELINE=1`
- `CLICKHOUSE_URL` is set and reachable

### ClickHouse ping fails

Check:

- URL includes protocol (`https://...`)
- correct user/password
- outbound network rules/firewall

### Counts differ

Check:

- comparing same timezone/window (use UTC first),
- sync lag (run sync-once multiple times),
- watermark progression stuck.

### Worker runs but no sync logs

Check branch/code includes:

- `src/jobs/clickhouseSync.ts`
- job startup call from `src/index.ts` in your merged code.

---

## 13) Optional: capture before/after Postgres load snapshots

Before enabling ClickHouse sync:

```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend/backend
npm run ops:query-stats-snapshot -- 25
```

After 1-2 hours:

```bash
npm run ops:query-stats-snapshot -- 25
```

Compare top query totals and rows returned.

