# Postgres Zero-Duration Diagnostics (D0/D1)

Use this pack to diagnose cohort playtime/session undercount from raw Postgres sessions.

## Parameters
Replace:
- `:game_id`
- `:cohort_day` (UTC install date)

Example: `DATE '2026-03-08'`

## 1) D0/D1 session health for one install cohort

```sql
WITH cohort_users AS (
  SELECT u.id AS user_id
  FROM "users" u
  WHERE u."gameId" = :game_id
    AND u."createdAt" >= (:cohort_day::date)::timestamptz
    AND u."createdAt" <  ((:cohort_day::date + INTERVAL '1 day'))::timestamptz
),
session_rows AS (
  SELECT
    s."userId" AS user_id,
    ((date_trunc('day', s."startTime")::date) - :cohort_day::date) AS day_index,
    s."endTime",
    s."lastHeartbeat",
    s."duration",
    EXTRACT(EPOCH FROM (COALESCE(s."endTime", s."lastHeartbeat", s."startTime") - s."startTime")) AS fallback_sec
  FROM "sessions" s
  JOIN cohort_users cu ON cu.user_id = s."userId"
  WHERE s."gameId" = :game_id
    AND date_trunc('day', s."startTime")::date BETWEEN :cohort_day::date AND (:cohort_day::date + 1)
)
SELECT
  day_index,
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE "endTime" IS NULL) AS sessions_endtime_null,
  COUNT(*) FILTER (WHERE COALESCE("duration", 0) <= 0) AS sessions_duration_zero_or_null,
  COUNT(*) FILTER (
    WHERE COALESCE("duration", 0) <= 0
      AND COALESCE(fallback_sec, 0) <= 0
  ) AS sessions_non_positive_fallback,
  COUNT(DISTINCT user_id) AS users_with_any_session,
  COUNT(DISTINCT user_id) FILTER (
    WHERE COALESCE("duration", 0) <= 0
       OR "endTime" IS NULL
  ) AS users_with_open_or_zero
FROM session_rows
WHERE day_index IN (0, 1)
GROUP BY day_index
ORDER BY day_index;
```

## 2) Zero-duration reason buckets (D0 only)

```sql
WITH cohort_users AS (
  SELECT u.id AS user_id
  FROM "users" u
  WHERE u."gameId" = :game_id
    AND u."createdAt" >= (:cohort_day::date)::timestamptz
    AND u."createdAt" <  ((:cohort_day::date + INTERVAL '1 day'))::timestamptz
),
d0_sessions AS (
  SELECT
    s."userId" AS user_id,
    s."endTime",
    s."lastHeartbeat",
    s."duration",
    EXTRACT(EPOCH FROM (COALESCE(s."endTime", s."lastHeartbeat", s."startTime") - s."startTime")) AS fallback_sec
  FROM "sessions" s
  JOIN cohort_users cu ON cu.user_id = s."userId"
  WHERE s."gameId" = :game_id
    AND date_trunc('day', s."startTime")::date = :cohort_day::date
),
bucketed AS (
  SELECT
    CASE
      WHEN "endTime" IS NULL AND "lastHeartbeat" IS NULL THEN 'no_end_no_heartbeat'
      WHEN "endTime" IS NOT NULL AND COALESCE("duration", 0) <= 0 THEN 'end_present_duration_non_positive'
      WHEN "endTime" IS NULL AND "lastHeartbeat" IS NOT NULL AND COALESCE("duration", 0) <= 0 THEN 'heartbeat_present_duration_non_positive'
      WHEN COALESCE("duration", 0) <= 0 AND COALESCE(fallback_sec, 0) <= 0 THEN 'fallback_non_positive'
      ELSE 'other'
    END AS reason,
    user_id
  FROM d0_sessions
  WHERE COALESCE("duration", 0) <= 0
)
SELECT
  reason,
  COUNT(*) AS sessions,
  COUNT(DISTINCT user_id) AS users
FROM bucketed
GROUP BY reason
ORDER BY sessions DESC;
```

## 3) Daily monitoring (last 7 install cohorts, D0 vs D1)

```sql
WITH cohort_days AS (
  SELECT generate_series((CURRENT_DATE - INTERVAL '6 day')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS cohort_day
),
cohort_users AS (
  SELECT
    cd.cohort_day,
    u.id AS user_id,
    COALESCE(NULLIF(u.platform, ''), 'unknown') AS platform,
    COALESCE(NULLIF(u.version, ''), 'unknown') AS app_version
  FROM cohort_days cd
  JOIN "users" u
    ON u."gameId" = :game_id
   AND u."createdAt" >= cd.cohort_day::timestamptz
   AND u."createdAt" <  (cd.cohort_day + INTERVAL '1 day')::timestamptz
),
sessions_joined AS (
  SELECT
    cu.cohort_day,
    cu.platform,
    cu.app_version,
    ((date_trunc('day', s."startTime")::date) - cu.cohort_day) AS day_index,
    s."userId" AS user_id,
    s."duration",
    s."endTime"
  FROM cohort_users cu
  JOIN "sessions" s
    ON s."userId" = cu.user_id
   AND s."gameId" = :game_id
   AND date_trunc('day', s."startTime")::date BETWEEN cu.cohort_day AND (cu.cohort_day + 1)
)
SELECT
  cohort_day,
  day_index,
  platform,
  app_version,
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE COALESCE("duration", 0) <= 0) AS zero_duration_sessions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE COALESCE("duration", 0) <= 0)
    / NULLIF(COUNT(*), 0),
    2
  ) AS zero_duration_session_pct,
  COUNT(DISTINCT user_id) AS users_with_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE COALESCE("duration", 0) <= 0 OR "endTime" IS NULL) AS users_with_open_or_zero
FROM sessions_joined
WHERE day_index IN (0, 1)
GROUP BY cohort_day, day_index, platform, app_version
ORDER BY cohort_day DESC, day_index ASC, total_sessions DESC;
```
