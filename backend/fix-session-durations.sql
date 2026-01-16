-- Fix Session Durations SQL Queries
-- These queries help identify and fix sessions where lastHeartbeat > endTime
--
-- USAGE ON RAILWAY:
-- 1. Go to Railway dashboard → Your project → PostgreSQL service
-- 2. Click "Data" tab
-- 3. Copy and paste queries below
-- OR
-- 1. Get DATABASE_URL from Railway variables
-- 2. Run: psql "postgresql://..." -f fix-session-durations.sql

-- 1. Find sessions with lastHeartbeat > endTime
-- This query shows how many sessions are affected
SELECT 
    COUNT(*) as affected_sessions,
    ROUND(AVG(EXTRACT(EPOCH FROM (last_heartbeat - end_time)))) as avg_difference_seconds
FROM sessions
WHERE end_time IS NOT NULL
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat > end_time;

-- 2. View examples of affected sessions
-- Shows details of sessions that need fixing
SELECT 
    id,
    platform,
    start_time,
    end_time,
    last_heartbeat,
    duration as current_duration_seconds,
    EXTRACT(EPOCH FROM (end_time - start_time)) as duration_by_endtime,
    EXTRACT(EPOCH FROM (last_heartbeat - start_time)) as duration_by_heartbeat,
    EXTRACT(EPOCH FROM (last_heartbeat - end_time)) as heartbeat_after_end_seconds
FROM sessions
WHERE end_time IS NOT NULL
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat > end_time
ORDER BY last_heartbeat DESC
LIMIT 10;

-- 3. Update sessions to use the later of endTime or lastHeartbeat
-- This is the FIX query - run this to correct the durations AND endTime
UPDATE sessions
SET 
    end_time = CASE 
        WHEN last_heartbeat > end_time THEN last_heartbeat 
        ELSE end_time 
    END,
    duration = GREATEST(
        EXTRACT(EPOCH FROM (end_time - start_time)),
        EXTRACT(EPOCH FROM (last_heartbeat - start_time))
    )::int
WHERE end_time IS NOT NULL
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat > end_time;

-- 4. Verify the fix
-- Run this after the update to confirm all sessions are fixed
SELECT 
    COUNT(*) as sessions_still_with_issue
FROM sessions
WHERE end_time IS NOT NULL
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat > end_time
  AND duration < EXTRACT(EPOCH FROM (last_heartbeat - start_time));

-- 5. Analytics: Show impact on metrics
-- This query shows how much the average session duration increased after the fix
WITH before_fix AS (
    SELECT 
        COUNT(*) as total_sessions,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_before
    FROM sessions
    WHERE end_time IS NOT NULL
      AND last_heartbeat IS NOT NULL
      AND last_heartbeat > end_time
),
after_fix AS (
    SELECT 
        AVG(duration) as avg_duration_after
    FROM sessions
    WHERE end_time IS NOT NULL
      AND last_heartbeat IS NOT NULL
)
SELECT 
    total_sessions,
    ROUND(avg_duration_before) as avg_duration_before_seconds,
    ROUND(avg_duration_after) as avg_duration_after_seconds,
    ROUND(avg_duration_after - avg_duration_before) as difference_seconds,
    ROUND((avg_duration_after - avg_duration_before) / 60) as difference_minutes
FROM before_fix, after_fix;

-- 6. Future-proof: Create a view that always uses the correct duration
-- You can use this view in analytics queries instead of the sessions table
CREATE OR REPLACE VIEW sessions_with_corrected_duration AS
SELECT 
    id,
    game_id,
    user_id,
    start_time,
    end_time,
    last_heartbeat,
    platform,
    version,
    -- Use the later of endTime or lastHeartbeat for duration calculation
    CASE 
        WHEN end_time IS NULL THEN duration  -- Session still open, use stored duration
        WHEN last_heartbeat IS NOT NULL AND last_heartbeat > end_time 
            THEN EXTRACT(EPOCH FROM (last_heartbeat - start_time))::int
        ELSE duration
    END as corrected_duration,
    duration as original_duration
FROM sessions;

-- Example usage of the view:
-- SELECT * FROM sessions_with_corrected_duration WHERE corrected_duration > original_duration;

