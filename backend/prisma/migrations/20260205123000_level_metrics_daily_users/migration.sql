CREATE TABLE IF NOT EXISTS "level_metrics_daily_users" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "levelId" INTEGER NOT NULL,
    "levelFunnel" TEXT NOT NULL DEFAULT '',
    "levelFunnelVersion" INTEGER NOT NULL DEFAULT 0,
    "platform" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "boosterUsed" BOOLEAN NOT NULL DEFAULT false,
    "egpUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "level_metrics_daily_users_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "level_metrics_daily_users_gameId_date_idx" ON "level_metrics_daily_users"("gameId", "date");
CREATE INDEX IF NOT EXISTS "level_metrics_daily_users_gameId_date_levelId_idx" ON "level_metrics_daily_users"("gameId", "date", "levelId");
CREATE INDEX IF NOT EXISTS "level_metrics_daily_users_gameId_funnel_date_idx" ON "level_metrics_daily_users"("gameId", "levelFunnel", "levelFunnelVersion", "date");
CREATE INDEX IF NOT EXISTS "level_metrics_daily_users_userId_idx" ON "level_metrics_daily_users"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "unique_daily_level_user" ON "level_metrics_daily_users"(
    "gameId",
    "date",
    "levelId",
    "levelFunnel",
    "levelFunnelVersion",
    "platform",
    "countryCode",
    "appVersion",
    "userId"
);

ALTER TABLE "level_metrics_daily_users"
ADD CONSTRAINT "level_metrics_daily_users_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
