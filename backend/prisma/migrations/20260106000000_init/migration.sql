-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."TestStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."games" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT,
    "version" TEXT,
    "country" TEXT,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "platform" TEXT,
    "version" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."events" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventName" TEXT NOT NULL,
    "properties" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."remote_configs" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remote_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ab_tests" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."TestStatus" NOT NULL DEFAULT 'DRAFT',
    "trafficSplit" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."test_variants" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "test_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."test_assignments" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checkpoints" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "tags" JSONB,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_checkpoints" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "player_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."releases" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "gameId" TEXT,
    "rolloutType" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'active',
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."release_features" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "impactMetrics" JSONB,
    "rolloutStartDate" TIMESTAMP(3),
    "rolloutEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."business_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "gameId" TEXT,
    "impact" TEXT,
    "metadata" JSONB,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_queries" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "context" JSONB,
    "response" TEXT,
    "responseType" TEXT,
    "confidence" DOUBLE PRECISION,
    "gameId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_insights" (
    "id" TEXT NOT NULL,
    "queryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "gameId" TEXT,
    "dateRange" JSONB,
    "metrics" JSONB,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."context_metadata" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dateRange" JSONB,
    "gameId" TEXT,
    "metadata" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "context_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_apiKey_key" ON "public"."games"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_gameId_externalId_key" ON "public"."users"("gameId", "externalId");

-- CreateIndex
CREATE INDEX "sessions_gameId_userId_startTime_idx" ON "public"."sessions"("gameId", "userId", "startTime");

-- CreateIndex
CREATE INDEX "sessions_gameId_startTime_idx" ON "public"."sessions"("gameId", "startTime");

-- CreateIndex
CREATE INDEX "events_gameId_eventName_timestamp_idx" ON "public"."events"("gameId", "eventName", "timestamp");

-- CreateIndex
CREATE INDEX "events_userId_timestamp_idx" ON "public"."events"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "remote_configs_gameId_key_environment_key" ON "public"."remote_configs"("gameId", "key", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "test_assignments_testId_userId_key" ON "public"."test_assignments"("testId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoints_gameId_name_key" ON "public"."checkpoints"("gameId", "name");

-- CreateIndex
CREATE INDEX "player_checkpoints_gameId_userId_timestamp_idx" ON "public"."player_checkpoints"("gameId", "userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "player_checkpoints_userId_checkpointId_key" ON "public"."player_checkpoints"("userId", "checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "releases_version_key" ON "public"."releases"("version");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."remote_configs" ADD CONSTRAINT "remote_configs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ab_tests" ADD CONSTRAINT "ab_tests_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."test_variants" ADD CONSTRAINT "test_variants_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."test_assignments" ADD CONSTRAINT "test_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."test_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."test_assignments" ADD CONSTRAINT "test_assignments_testId_fkey" FOREIGN KEY ("testId") REFERENCES "public"."ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."checkpoints" ADD CONSTRAINT "checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_checkpoints" ADD CONSTRAINT "player_checkpoints_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "public"."checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_checkpoints" ADD CONSTRAINT "player_checkpoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_checkpoints" ADD CONSTRAINT "player_checkpoints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."releases" ADD CONSTRAINT "releases_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."release_features" ADD CONSTRAINT "release_features_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "public"."releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."business_events" ADD CONSTRAINT "business_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_queries" ADD CONSTRAINT "ai_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_queries" ADD CONSTRAINT "ai_queries_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_insights" ADD CONSTRAINT "ai_insights_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "public"."ai_queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_insights" ADD CONSTRAINT "ai_insights_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."context_metadata" ADD CONSTRAINT "context_metadata_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

