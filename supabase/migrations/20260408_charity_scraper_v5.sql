-- Charity Scraper v5 — event_date column + updated upsert constraint
-- Safe to run multiple times (IF NOT EXISTS guards)

DO $$
BEGIN
  -- Add event_date if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'event_date'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN event_date DATE;
  END IF;

  -- Add scrape_fail_count if not present (may exist from prior migration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'scrape_fail_count'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN scrape_fail_count INTEGER DEFAULT 0;
  END IF;

  -- Add structure_sheet_url if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'structure_sheet_url'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN structure_sheet_url TEXT;
  END IF;

  -- Add online_registration_url if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'online_registration_url'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN online_registration_url TEXT;
  END IF;

  -- Add rebuy_addon if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'rebuy_addon'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN rebuy_addon TEXT;
  END IF;

  -- Add late_registration if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'late_registration'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN late_registration TEXT;
  END IF;

  -- Add max_entries if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'max_entries'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN max_entries INTEGER;
  END IF;

  -- Add registration_opens if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_daily_tournaments' AND column_name = 'registration_opens'
  ) THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN registration_opens TEXT;
  END IF;
END $$;

-- Drop the old upsert constraint (no event_date) if it exists
ALTER TABLE venue_daily_tournaments
  DROP CONSTRAINT IF EXISTS venue_daily_tournaments_venue_id_day_of_week_start_time_key;

ALTER TABLE venue_daily_tournaments
  DROP CONSTRAINT IF EXISTS uq_vdt_venue_day_time_buyin_game;

-- Add new upsert constraint with event_date included
-- This allows 10 separate dated copies of the same recurring tournament
ALTER TABLE venue_daily_tournaments
  DROP CONSTRAINT IF EXISTS uq_vdt_v5_full;

ALTER TABLE venue_daily_tournaments
  ADD CONSTRAINT uq_vdt_v5_full
  UNIQUE (venue_id, venue_name, day_of_week, event_date, start_time, buy_in, game_type);

-- Indexes for v5 queries
CREATE INDEX IF NOT EXISTS idx_vdt_v5_event_date ON venue_daily_tournaments(event_date, is_active);
CREATE INDEX IF NOT EXISTS idx_vdt_v5_fail_count  ON venue_daily_tournaments(scrape_fail_count DESC)
  WHERE scrape_fail_count > 0;

SELECT 'Charity v5 migration complete ✅' AS status;
