-- ============================================
-- Session Duration Fix for Railway Dashboard
-- ============================================
-- Copy and paste these queries into Railway's PostgreSQL Data tab
-- Run them in order: 1 → 2 → 3 → 4

-- ============================================
-- STEP 1: Check how many sessions need fixing
-- ============================================
SELECT COUNT(*) as sessions_to_fix
FROM sessions
WHERE "endTime" IS NOT NULL
  AND "lastHeartbeat" IS NOT NULL
  AND "lastHeartbeat" > "endTime";


-- ============================================
-- STEP 2: View examples (optional)
-- ============================================
SELECT 
    id,
    platform,
    "startTime",
    "endTime",
    "lastHeartbeat",
    duration as current_duration,
    EXTRACT(EPOCH FROM ("lastHeartbeat" - "startTime"))::int as corrected_duration,
    EXTRACT(EPOCH FROM ("lastHeartbeat" - "endTime"))::int as difference_seconds
FROM sessions
WHERE "endTime" IS NOT NULL
  AND "lastHeartbeat" IS NOT NULL
  AND "lastHeartbeat" > "endTime"
ORDER BY "lastHeartbeat" DESC
LIMIT 10;


-- ============================================
-- STEP 3: FIX THE SESSIONS ⚠️
-- ============================================
-- This updates both endTime and duration
UPDATE sessions
SET 
    "endTime" = CASE 
        WHEN "lastHeartbeat" > "endTime" THEN "lastHeartbeat" 
        ELSE "endTime" 
    END,
    duration = GREATEST(
        EXTRACT(EPOCH FROM ("endTime" - "startTime")),
        EXTRACT(EPOCH FROM ("lastHeartbeat" - "startTime"))
    )::int
WHERE "endTime" IS NOT NULL
  AND "lastHeartbeat" IS NOT NULL
  AND "lastHeartbeat" > "endTime";


-- ============================================
-- STEP 4: Verify the fix (should return 0)
-- ============================================
SELECT COUNT(*) as remaining_issues
FROM sessions
WHERE "endTime" IS NOT NULL
  AND "lastHeartbeat" IS NOT NULL
  AND "lastHeartbeat" > "endTime";

