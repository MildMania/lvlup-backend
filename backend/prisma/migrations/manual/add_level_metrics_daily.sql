-- Migration: Add Level Metrics Daily Pre-Aggregation Table
-- This table stores pre-calculated level funnel metrics by day and filter dimensions

CREATE TABLE "level_metrics_daily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "levelId" INTEGER NOT NULL,
    
    -- Filter dimensions
    "levelFunnel" TEXT,
    "levelFunnelVersion" INTEGER,
    "platform" TEXT,
    "countryCode" TEXT,
    "appVersion" TEXT,
    
    -- Pre-calculated metrics
    "startedPlayers" INTEGER NOT NULL DEFAULT 0,
    "completedPlayers" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "completes" INTEGER NOT NULL DEFAULT 0,
    "fails" INTEGER NOT NULL DEFAULT 0,
    
    -- User tracking (for cross-level calculations)
    "startedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Duration metrics
    "totalCompletionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFailDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    
    -- Booster/EGP
    "usersWithBoosters" INTEGER NOT NULL DEFAULT 0,
    "failsWithPurchase" INTEGER NOT NULL DEFAULT 0,
    
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "level_metrics_daily_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for fast filtering
CREATE INDEX "level_metrics_daily_gameId_date_levelId_idx" ON "level_metrics_daily"("gameId", "date", "levelId");
CREATE INDEX "level_metrics_daily_gameId_date_platform_idx" ON "level_metrics_daily"("gameId", "date", "platform");
CREATE INDEX "level_metrics_daily_gameId_date_countryCode_idx" ON "level_metrics_daily"("gameId", "date", "countryCode");
CREATE INDEX "level_metrics_daily_gameId_date_appVersion_idx" ON "level_metrics_daily"("gameId", "date", "appVersion");
CREATE INDEX "level_metrics_daily_gameId_date_levelFunnel_levelFunnelVersion_idx" ON "level_metrics_daily"("gameId", "date", "levelFunnel", "levelFunnelVersion");

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX "level_metrics_daily_gameId_date_levelId_levelFunnel_levelFu_key" ON "level_metrics_daily"(
    "gameId", "date", "levelId", 
    COALESCE("levelFunnel", ''), 
    COALESCE("levelFunnelVersion", 0), 
    COALESCE("platform", ''), 
    COALESCE("countryCode", ''), 
    COALESCE("appVersion", '')
);

