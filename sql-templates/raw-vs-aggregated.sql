WITH raw_metrics AS (
  SELECT 
    COUNT(*) FILTER (WHERE "eventName" = 'level_start') as total_starts,
    COUNT(*) FILTER (WHERE "eventName" = 'level_complete') as total_completes,
    COUNT(DISTINCT CASE WHEN "eventName" = 'level_start' THEN "userId" END) as started_players,
    COUNT(DISTINCT CASE 
      WHEN "eventName" IN ('level_complete', 'level_failed')
           AND properties->'boosters' IS NOT NULL 
           AND (SELECT COUNT(*) FROM jsonb_object_keys(properties->'boosters')) > 0
      THEN "userId" 
    END) as booster_users,
    COUNT(DISTINCT CASE 
      WHEN "eventName" IN ('level_complete', 'level_failed')
           AND (
             (properties->>'egp')::numeric > 0 
             OR properties->>'egp' = 'true'
             OR (properties->>'endGamePurchase')::numeric > 0
             OR properties->>'endGamePurchase' = 'true'
           )
      THEN "userId" 
    END) as egp_users
  FROM events
  WHERE "gameId" = 'cmkkteznd0076mn1m2dxl1ijd'
    AND "eventName" IN ('level_start', 'level_complete', 'level_failed')
    AND (properties->>'levelId')::int = 30
    AND timestamp >= '2026-01-26 00:00:00'
    AND timestamp < '2026-01-27 00:00:00'
),
aggregated_metrics AS (
  SELECT 
    SUM(starts) as total_starts,
    SUM(completes) as total_completes,
    SUM("startedPlayers") as started_players,
    SUM("boosterUsers") as booster_users,
    SUM("egpUsers") as egp_users
  FROM level_metrics_daily
  WHERE "gameId" = 'cmkkteznd0076mn1m2dxl1ijd'
    AND "levelId" = 30
	AND date >= '2026-01-26 00:00:00'
    AND date < '2026-01-27 00:00:00'
)
SELECT 
  'Raw Events' as source,
  raw_metrics.total_starts,
  raw_metrics.total_completes,
  raw_metrics.started_players,
  raw_metrics.booster_users,
  raw_metrics.egp_users,
  ROUND(raw_metrics.booster_users::numeric * 100.0 / NULLIF(raw_metrics.started_players, 0), 2) as booster_pct,
  ROUND(raw_metrics.egp_users::numeric * 100.0 / NULLIF(raw_metrics.started_players, 0), 2) as egp_pct
FROM raw_metrics
UNION ALL
SELECT 
  'Aggregated' as source,
  aggregated_metrics.total_starts,
  aggregated_metrics.total_completes,
  aggregated_metrics.started_players,
  aggregated_metrics.booster_users,
  aggregated_metrics.egp_users,
  ROUND(aggregated_metrics.booster_users::numeric * 100.0 / NULLIF(aggregated_metrics.started_players, 0), 2) as booster_pct,
  ROUND(aggregated_metrics.egp_users::numeric * 100.0 / NULLIF(aggregated_metrics.started_players, 0), 2) as egp_pct
FROM aggregated_metrics;