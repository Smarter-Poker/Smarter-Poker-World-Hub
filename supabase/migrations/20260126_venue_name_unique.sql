-- ============================================================
-- ADD VENUE NAME UNIQUE CONSTRAINT FOR SCRAPER
-- Run: 2026-01-26
-- ============================================================

-- Add unique constraint on venue_name + schedule info
-- This allows upsert using venue_name without needing venue_id
ALTER TABLE venue_daily_tournaments
DROP CONSTRAINT IF EXISTS venue_daily_tournaments_venue_name_unique;

ALTER TABLE venue_daily_tournaments
ADD CONSTRAINT venue_daily_tournaments_venue_name_unique
UNIQUE (venue_name, day_of_week, start_time, buy_in);

-- Add index for faster lookups by venue_name
CREATE INDEX IF NOT EXISTS idx_daily_tournaments_venue_name
ON venue_daily_tournaments(venue_name);

-- Add index for day_of_week queries
CREATE INDEX IF NOT EXISTS idx_daily_tournaments_day_active
ON venue_daily_tournaments(day_of_week, is_active);

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'venue_daily_tournaments'::regclass;
