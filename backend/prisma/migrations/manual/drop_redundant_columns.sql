-- Migration: Drop redundant Event table columns
-- Drop app metadata fields
ALTER TABLE "Event" DROP COLUMN IF EXISTS "channelId";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "appSignature";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "engineVersion";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "bundleId";
-- Drop app metadata fields

ALTER TABLE "Event" DROP COLUMN IF EXISTS "timezone";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "longitude";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "city";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "region";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "country";
-- Drop geographic fields (keeping only countryCode)

-- IMPORTANT: This cannot be automatically reversed. Make a backup first if needed.

-- Estimated savings: ~50-100 MB for 358k events, more as data grows
-- Purpose: Remove unused/redundant fields to reduce database size
-- Date: 2026-01-28

