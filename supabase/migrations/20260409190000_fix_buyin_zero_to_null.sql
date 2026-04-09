-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Allow buy_in to be NULL in venue_daily_tournaments
-- Problem:   Scrapers that failed to extract a buy-in defaulted to 0
--            because the buy_in column was NOT NULL.
--            This caused the UI to show "Free Entry" (0) instead of "TBD" (NULL).
-- Fix:       1. Remove NOT NULL constraint on buy_in
--            2. Update buy_in = 0 to NULL where appropriate
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Remove NOT NULL constraint
ALTER TABLE venue_daily_tournaments ALTER COLUMN buy_in DROP NOT NULL;

-- Step 2: Set buy_in to NULL where it was incorrectly stored as 0
UPDATE venue_daily_tournaments
SET buy_in = NULL
WHERE buy_in = 0;
