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
    "lastHeartbeat" DATETIME,
    "platform" TEXT,
    "version" TEXT,
    "countryCode" TEXT,
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
    "serverReceivedAt" DATETIME,
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
    "dataType" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "remote_configs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rule_overwrites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "overrideValue" JSONB NOT NULL,
    "platformConditions" JSONB,
    "countryConditions" JSONB,
    "segmentConditions" JSONB,
    "activeBetweenStart" DATETIME,
    "activeBetweenEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rule_overwrites_configId_fkey" FOREIGN KEY ("configId") REFERENCES "remote_configs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "config_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_history_configId_fkey" FOREIGN KEY ("configId") REFERENCES "remote_configs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "config_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "dataType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "changes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deployedAt" DATETIME,
    "deployedBy" TEXT,
    "rejectionReason" TEXT,
    CONSTRAINT "config_drafts_configId_fkey" FOREIGN KEY ("configId") REFERENCES "remote_configs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "config_drafts_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rule_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT,
    "configId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rule_history_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rule_overwrites" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "validation_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleValue" TEXT NOT NULL,
    CONSTRAINT "validation_rules_configId_fkey" FOREIGN KEY ("configId") REFERENCES "remote_configs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

-- CreateTable
CREATE TABLE "dashboard_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockReason" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLogin" DATETIME,
    "lastLogin" DATETIME,
    "lastLoginIp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_accesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT,
    "userId" TEXT,
    "gameId" TEXT,
    "allGames" BOOLEAN NOT NULL DEFAULT false,
    "accessLevel" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" DATETIME,
    CONSTRAINT "game_accesses_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "game_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "game_accesses_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "teamId" TEXT,
    "role" TEXT NOT NULL,
    "gameIds" JSONB,
    "accessLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "acceptedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "dashboard_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invitations_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "dashboard_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "invitations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "secret" TEXT NOT NULL,
    "backupCodes" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "two_factor_auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "deployedBy" TEXT NOT NULL,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackFrom" TEXT,
    CONSTRAINT "deployments_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE INDEX "sessions_gameId_countryCode_startTime_idx" ON "sessions"("gameId", "countryCode", "startTime");

-- CreateIndex
CREATE INDEX "sessions_endTime_lastHeartbeat_idx" ON "sessions"("endTime", "lastHeartbeat");

-- CreateIndex
CREATE INDEX "events_gameId_eventName_timestamp_idx" ON "events"("gameId", "eventName", "timestamp");

-- CreateIndex
CREATE INDEX "events_userId_timestamp_idx" ON "events"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "events_gameId_appVersion_timestamp_idx" ON "events"("gameId", "appVersion", "timestamp");

-- CreateIndex
CREATE INDEX "remote_configs_gameId_environment_enabled_idx" ON "remote_configs"("gameId", "environment", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "remote_configs_gameId_key_environment_key" ON "remote_configs"("gameId", "key", "environment");

-- CreateIndex
CREATE INDEX "rule_overwrites_configId_priority_enabled_idx" ON "rule_overwrites"("configId", "priority", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "rule_overwrites_configId_priority_key" ON "rule_overwrites"("configId", "priority");

-- CreateIndex
CREATE INDEX "config_history_configId_changedAt_idx" ON "config_history"("configId", "changedAt");

-- CreateIndex
CREATE INDEX "config_drafts_configId_status_idx" ON "config_drafts"("configId", "status");

-- CreateIndex
CREATE INDEX "config_drafts_gameId_status_idx" ON "config_drafts"("gameId", "status");

-- CreateIndex
CREATE INDEX "config_drafts_createdAt_idx" ON "config_drafts"("createdAt");

-- CreateIndex
CREATE INDEX "rule_history_configId_changedAt_idx" ON "rule_history"("configId", "changedAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_email_key" ON "dashboard_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_emailVerificationToken_key" ON "dashboard_users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_passwordResetToken_key" ON "dashboard_users"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE INDEX "game_accesses_teamId_gameId_idx" ON "game_accesses"("teamId", "gameId");

-- CreateIndex
CREATE INDEX "game_accesses_userId_gameId_idx" ON "game_accesses"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_acceptedBy_key" ON "invitations"("acceptedBy");

-- CreateIndex
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_userId_key" ON "two_factor_auth"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "deployments_gameId_environment_deployedAt_idx" ON "deployments"("gameId", "environment", "deployedAt");

-- CreateIndex
CREATE INDEX "deployments_gameId_environment_version_idx" ON "deployments"("gameId", "environment", "version");

