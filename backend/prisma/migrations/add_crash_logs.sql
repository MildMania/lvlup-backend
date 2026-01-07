-- CreateEnum for CrashSeverity
CREATE TYPE "CrashSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'ERROR', 'WARNING');

-- CreateTable CrashLog
CREATE TABLE "crash_logs" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "crash_type" TEXT NOT NULL,
    "severity" "CrashSeverity" NOT NULL DEFAULT 'ERROR',
    "message" TEXT NOT NULL,
    "stack_trace" TEXT NOT NULL,
    "exception_type" TEXT,
    "platform" TEXT,
    "os_version" TEXT,
    "manufacturer" TEXT,
    "device" TEXT,
    "device_id" TEXT,
    "app_version" TEXT,
    "app_build" TEXT,
    "bundle_id" TEXT,
    "engine_version" TEXT,
    "sdk_version" TEXT,
    "country" TEXT,
    "connection_type" TEXT,
    "memory_usage" BIGINT,
    "battery_level" DOUBLE PRECISION,
    "disk_space" BIGINT,
    "breadcrumbs" JSONB,
    "custom_data" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "crash_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crash_logs_game_id_timestamp_idx" ON "crash_logs"("game_id", "timestamp");
CREATE INDEX "crash_logs_game_id_platform_timestamp_idx" ON "crash_logs"("game_id", "platform", "timestamp");
CREATE INDEX "crash_logs_game_id_app_version_timestamp_idx" ON "crash_logs"("game_id", "app_version", "timestamp");
CREATE INDEX "crash_logs_game_id_crash_type_timestamp_idx" ON "crash_logs"("game_id", "crash_type", "timestamp");
CREATE INDEX "crash_logs_game_id_severity_timestamp_idx" ON "crash_logs"("game_id", "severity", "timestamp");

-- AddForeignKey
ALTER TABLE "crash_logs" ADD CONSTRAINT "crash_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

