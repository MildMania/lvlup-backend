-- Drop old unused columns from revenue table
ALTER TABLE "revenue" 
DROP COLUMN IF EXISTS "eventId",
DROP COLUMN IF EXISTS "clientTs",
DROP COLUMN IF EXISTS "osVersion",
DROP COLUMN IF EXISTS "manufacturer",
DROP COLUMN IF EXISTS "connectionType";

-- Add new ad impression fields
ALTER TABLE "revenue" 
ADD COLUMN IF NOT EXISTS "adUnitId" TEXT,
ADD COLUMN IF NOT EXISTS "adUnitName" TEXT,
ADD COLUMN IF NOT EXISTS "adCreativeId" TEXT,
ADD COLUMN IF NOT EXISTS "adNetworkPlacement" TEXT;

-- Add new IAP fields
ALTER TABLE "revenue" 
ADD COLUMN IF NOT EXISTS "productName" TEXT,
ADD COLUMN IF NOT EXISTS "orderId" TEXT,
ADD COLUMN IF NOT EXISTS "purchaseToken" TEXT,
ADD COLUMN IF NOT EXISTS "isSandbox" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "isRestored" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "subscriptionPeriod" TEXT;

-- Add context and custom data fields
ALTER TABLE "revenue" 
ADD COLUMN IF NOT EXISTS "customData" JSONB,
ADD COLUMN IF NOT EXISTS "device" TEXT;

-- Create indexes for new fields (deduplication and querying)
CREATE INDEX IF NOT EXISTS "revenue_adUnitId_idx" ON "revenue"("adUnitId");
CREATE INDEX IF NOT EXISTS "revenue_orderId_idx" ON "revenue"("orderId");

