-- Egress/CPU-oriented indexes for analytics + aggregation paths
-- Safe for production: use CONCURRENTLY to avoid long table locks.
-- NOTE: Run each statement outside a transaction block.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_game_timestamp_user
  ON "events" ("gameId", "timestamp", "userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_game_created_id
  ON "users" ("gameId", "createdAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_revenue_game_timestamp_user
  ON "revenue" ("gameId", "timestamp", "userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_open_lastheartbeat
  ON "sessions" ("lastHeartbeat", "id")
  WHERE "endTime" IS NULL;

