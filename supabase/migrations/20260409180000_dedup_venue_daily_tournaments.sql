-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Dedup venue_daily_tournaments + Add unique index
-- Purpose:   1) Remove duplicate rows created by repeated scraper runs
--            2) Add UNIQUE constraint to prevent future duplicates
--
-- Note: id column is UUID — cannot use MAX(uuid).
--       We use ctid (physical row address) to keep the LAST inserted row
--       of each duplicate group, which is the safest strategy.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Delete duplicates — keep the row with the largest ctid (last inserted)
-- Key: (venue_name, day_of_week, start_time, game_type, buy_in)
-- NULLs: COALESCE ensures NULL values group together correctly
DELETE FROM venue_daily_tournaments
WHERE ctid NOT IN (
  SELECT MAX(ctid)
  FROM venue_daily_tournaments
  GROUP BY
    LOWER(TRIM(COALESCE(venue_name, ''))),
    LOWER(TRIM(COALESCE(day_of_week, ''))),
    LOWER(TRIM(COALESCE(start_time::text, ''))),
    LOWER(TRIM(COALESCE(game_type, 'nlh'))),
    COALESCE(buy_in, -1)
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

-- Step 3: Document the schema intent
COMMENT ON TABLE venue_daily_tournaments IS
  'Daily recurring tournament schedules scraped from venue/charity websites. '
  'Unique index on (venue_name, day_of_week, start_time, game_type, buy_in) '
  'prevents duplicate scraper runs. buy_in=0 means Free Entry; buy_in IS NULL means unknown.';
