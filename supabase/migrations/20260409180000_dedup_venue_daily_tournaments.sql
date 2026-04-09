-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Dedup venue_daily_tournaments + Add unique index
-- Purpose:   1) Remove duplicate rows created by repeated scraper runs
--            2) Add UNIQUE constraint to prevent future duplicates
-- Safe:      Uses DELETE WHERE id NOT IN (keep max id per key group)
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Delete duplicate rows, keeping the highest (most recent) id per key group
-- Key: (venue_name, day_of_week, start_time, game_type, buy_in)
-- NULLs: buy_in NULL rows are treated as a separate group (NULLS are never equal in SQL =)
--        so we handle nulls with COALESCE to group them correctly

DELETE FROM venue_daily_tournaments
WHERE id NOT IN (
  SELECT MAX(id)
  FROM venue_daily_tournaments
  GROUP BY
    LOWER(TRIM(COALESCE(venue_name, ''))),
    LOWER(TRIM(COALESCE(day_of_week, ''))),
    LOWER(TRIM(COALESCE(start_time::text, ''))),
    LOWER(TRIM(COALESCE(game_type, 'nlh'))),
    COALESCE(buy_in, -1)  -- -1 sentinel groups all NULLs together
);

-- Step 2: Add a unique index to prevent future duplicate insertions
-- Using a functional index with COALESCE to handle NULLs consistently
-- This lets scrapers use INSERT ... ON CONFLICT DO NOTHING or ON CONFLICT DO UPDATE
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_daily_tournaments_dedup
ON venue_daily_tournaments (
  LOWER(TRIM(COALESCE(venue_name, ''))),
  LOWER(TRIM(COALESCE(day_of_week, ''))),
  LOWER(TRIM(COALESCE(start_time::text, ''))),
  LOWER(TRIM(COALESCE(game_type, 'nlh'))),
  COALESCE(buy_in, -1)
)
WHERE is_active = true;

-- Step 3: Add a comment to document the dedup strategy
COMMENT ON TABLE venue_daily_tournaments IS
  'Daily recurring tournament schedules scraped from venue/charity websites. '
  'Unique constraint on (venue_name, day_of_week, start_time, game_type, buy_in) '
  'prevents duplicate scraper runs. buy_in=0 means Free Entry; buy_in IS NULL means unknown.';
