-- Migration: Add is_suppressed column to poker_venues, poker_series, tournament_series
-- This prevents scrapers from re-inserting manually deleted / unwanted records.
-- When is_suppressed = true, ALL scrapers must skip the record permanently.
-- Date: 2026-04-09

-- ============================================================
-- STEP 1: Add is_suppressed to poker_venues
-- ============================================================
ALTER TABLE poker_venues
  ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_poker_venues_is_suppressed
  ON poker_venues (is_suppressed)
  WHERE is_suppressed = true;

-- ============================================================
-- STEP 2: Add is_suppressed to poker_series
-- ============================================================
ALTER TABLE poker_series
  ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_poker_series_is_suppressed
  ON poker_series (is_suppressed)
  WHERE is_suppressed = true;

-- ============================================================
-- STEP 3: Add is_suppressed to tournament_series (if exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tournament_series' AND table_schema = 'public'
  ) THEN
    ALTER TABLE tournament_series
      ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS idx_tournament_series_is_suppressed
      ON tournament_series (is_suppressed)
      WHERE is_suppressed = true;
  END IF;
END $$;

-- ============================================================
-- STEP 4: Pre-suppress the 39 previously deleted venues
-- These were deleted via 20260408212800_delete_inactive_venues.sql
-- They may have been re-inserted by scrapers — mark them now.
-- IDs: 1929,1857,1866,1864,2498,2625,1949,2320,2654,2730,
--      2653,2701,1873,2641,1874,2646,3118,2616,2692,1990,
--      1989,2652,1846,2764,2729,2636,1900,1905,2413,1907,
--      1910,2639,1914,1915,1916,2716,2759,1898,1897
-- ============================================================
UPDATE poker_venues
SET is_suppressed = true,
    is_active = false
WHERE id IN (
  1929,1857,1866,1864,2498,2625,1949,2320,2654,2730,
  2653,2701,1873,2641,1874,2646,3118,2616,2692,1990,
  1989,2652,1846,2764,2729,2636,1900,1905,2413,1907,
  1910,2639,1914,1915,1916,2716,2759,1898,1897
);

-- ============================================================
-- STEP 5: RLS — service role can update is_suppressed
-- (No additional policy needed — service role bypasses RLS)
-- ============================================================

-- Comment: To suppress a venue/series in the future:
--   UPDATE poker_venues SET is_suppressed = true, is_active = false WHERE id = X;
--   UPDATE poker_series SET is_suppressed = true WHERE series_uid = 'pa_slug-here';
-- Scrapers will permanently skip it on every future run.
