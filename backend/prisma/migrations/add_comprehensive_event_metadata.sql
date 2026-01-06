-- Add comprehensive event metadata fields to events table
-- Based on GameAnalytics event structure

-- Add event metadata columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS "eventUuid" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "clientTs" BIGINT;

-- Add device & platform info columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS "platform" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "osVersion" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "manufacturer" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "device" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

-- Add app info columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "appBuild" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "bundleId" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "engineVersion" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "sdkVersion" TEXT;

-- Add network & additional columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS "connectionType" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "sessionNum" INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "appSignature" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "channelId" TEXT;

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS "events_platform_timestamp_idx" ON events("gameId", "platform", "timestamp");
CREATE INDEX IF NOT EXISTS "events_appVersion_timestamp_idx" ON events("gameId", "appVersion", "timestamp");

-- Add comments for documentation
COMMENT ON COLUMN events."eventUuid" IS 'Unique event identifier from client';
COMMENT ON COLUMN events."clientTs" IS 'Client-side Unix timestamp in seconds';
COMMENT ON COLUMN events."platform" IS 'Platform: android, ios, webgl, etc.';
COMMENT ON COLUMN events."osVersion" IS 'OS version: e.g., "android 13", "iOS 16.0"';
COMMENT ON COLUMN events."manufacturer" IS 'Device manufacturer: e.g., "TECNO", "Apple"';
COMMENT ON COLUMN events."device" IS 'Device model: e.g., "TECNO BG6", "iPhone 14"';
COMMENT ON COLUMN events."deviceId" IS 'Unique device identifier';
COMMENT ON COLUMN events."appVersion" IS 'App version: e.g., "0.0.3"';
COMMENT ON COLUMN events."appBuild" IS 'App build number: e.g., "30087"';
COMMENT ON COLUMN events."bundleId" IS 'App bundle identifier: e.g., "com.mildmania.packperfect"';
COMMENT ON COLUMN events."engineVersion" IS 'Game engine version: e.g., "unity 2022.3.62"';
COMMENT ON COLUMN events."sdkVersion" IS 'SDK version: e.g., "unity 1.0.0"';
COMMENT ON COLUMN events."connectionType" IS 'Network connection: wifi, wwan, offline';
COMMENT ON COLUMN events."sessionNum" IS 'Session number for this user (lifetime count)';
COMMENT ON COLUMN events."appSignature" IS 'Android app signature';
COMMENT ON COLUMN events."channelId" IS 'Install channel: e.g., "com.android.vending" (Google Play)';

