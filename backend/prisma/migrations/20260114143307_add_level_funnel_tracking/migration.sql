-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT,
    "version" TEXT,
    "country" TEXT,
    "language" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "duration" INTEGER,
    "platform" TEXT,
    "version" TEXT,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sessions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventName" TEXT NOT NULL,
    "properties" JSONB,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abTests" JSONB,
    "levelFunnel" TEXT,
    "levelFunnelVersion" INTEGER,
    "eventUuid" TEXT,
    "clientTs" BIGINT,
    "platform" TEXT,
    "osVersion" TEXT,
    "manufacturer" TEXT,
    "device" TEXT,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "appBuild" TEXT,
    "bundleId" TEXT,
    "engineVersion" TEXT,
    "sdkVersion" TEXT,
    "connectionType" TEXT,
    "sessionNum" INTEGER,
    "appSignature" TEXT,
    "channelId" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "timezone" TEXT,
    CONSTRAINT "events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "remote_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "remote_configs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ab_tests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trafficSplit" REAL NOT NULL DEFAULT 0.5,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ab_tests_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "test_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "weight" REAL NOT NULL DEFAULT 0.5,
    CONSTRAINT "test_variants_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "test_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "test_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "test_variants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ab_tests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checkpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "tags" JSONB,
    "order" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_checkpoints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "player_checkpoints_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "checkpoints" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "player_checkpoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "player_checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "releaseDate" DATETIME NOT NULL,
    "description" TEXT,
    "gameId" TEXT,
    "rolloutType" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'active',
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "releases_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "release_features" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "impactMetrics" JSONB,
    "rolloutStartDate" DATETIME,
    "rolloutEndDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "release_features_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "business_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "gameId" TEXT,
    "impact" TEXT,
    "metadata" JSONB,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_queries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "context" JSONB,
    "response" TEXT,
    "responseType" TEXT,
    "confidence" REAL,
    "gameId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ai_queries_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "gameId" TEXT,
    "dateRange" JSONB,
    "metrics" JSONB,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_insights_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "ai_queries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ai_insights_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "context_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dateRange" JSONB,
    "gameId" TEXT,
    "metadata" JSONB NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "context_metadata_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "crash_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "crashType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "message" TEXT NOT NULL,
    "stackTrace" TEXT NOT NULL,
    "exceptionType" TEXT,
    "platform" TEXT,
    "osVersion" TEXT,
    "manufacturer" TEXT,
    "device" TEXT,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "appBuild" TEXT,
    "bundleId" TEXT,
    "engineVersion" TEXT,
    "sdkVersion" TEXT,
    "country" TEXT,
    "connectionType" TEXT,
    "memoryUsage" INTEGER,
    "batteryLevel" REAL,
    "diskSpace" INTEGER,
    "breadcrumbs" TEXT,
    "customData" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    CONSTRAINT "crash_logs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "games_apiKey_key" ON "games"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_gameId_externalId_key" ON "users"("gameId", "externalId");

-- CreateIndex
CREATE INDEX "sessions_gameId_userId_startTime_idx" ON "sessions"("gameId", "userId", "startTime");

-- CreateIndex
CREATE INDEX "sessions_gameId_startTime_idx" ON "sessions"("gameId", "startTime");

-- CreateIndex
CREATE INDEX "events_gameId_eventName_timestamp_idx" ON "events"("gameId", "eventName", "timestamp");

-- CreateIndex
CREATE INDEX "events_userId_timestamp_idx" ON "events"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "events_gameId_platform_timestamp_idx" ON "events"("gameId", "platform", "timestamp");

-- CreateIndex
CREATE INDEX "events_gameId_appVersion_timestamp_idx" ON "events"("gameId", "appVersion", "timestamp");

-- CreateIndex
CREATE INDEX "events_gameId_country_timestamp_idx" ON "events"("gameId", "country", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "remote_configs_gameId_key_environment_key" ON "remote_configs"("gameId", "key", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "test_assignments_testId_userId_key" ON "test_assignments"("testId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_gameId_name_key" ON "checkpoints"("gameId", "name");

-- CreateIndex
CREATE INDEX "player_checkpoints_gameId_userId_timestamp_idx" ON "player_checkpoints"("gameId", "userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "player_checkpoints_userId_checkpointId_key" ON "player_checkpoints"("userId", "checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "releases_version_key" ON "releases"("version");

-- CreateIndex
CREATE INDEX "crash_logs_gameId_timestamp_idx" ON "crash_logs"("gameId", "timestamp");

-- CreateIndex
CREATE INDEX "crash_logs_gameId_platform_timestamp_idx" ON "crash_logs"("gameId", "platform", "timestamp");

-- CreateIndex
CREATE INDEX "crash_logs_gameId_appVersion_timestamp_idx" ON "crash_logs"("gameId", "appVersion", "timestamp");

-- CreateIndex
CREATE INDEX "crash_logs_gameId_crashType_timestamp_idx" ON "crash_logs"("gameId", "crashType", "timestamp");

-- CreateIndex
CREATE INDEX "crash_logs_gameId_severity_timestamp_idx" ON "crash_logs"("gameId", "severity", "timestamp");
