-- Improve real-time events feed query path (ORDER BY serverReceivedAt with game filters)
-- Safe additive indexes only.

CREATE INDEX IF NOT EXISTS "events_gameId_serverReceivedAt_idx"
ON "events" ("gameId", "serverReceivedAt");

CREATE INDEX IF NOT EXISTS "events_gameId_eventName_serverReceivedAt_idx"
ON "events" ("gameId", "eventName", "serverReceivedAt");

CREATE INDEX IF NOT EXISTS "revenue_gameId_serverReceivedAt_idx"
ON "revenue" ("gameId", "serverReceivedAt");

CREATE INDEX IF NOT EXISTS "revenue_gameId_revenueType_serverReceivedAt_idx"
ON "revenue" ("gameId", "revenueType", "serverReceivedAt");
