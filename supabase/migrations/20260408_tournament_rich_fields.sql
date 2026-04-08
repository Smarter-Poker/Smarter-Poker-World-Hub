-- Add all new columns to venue_daily_tournaments
-- Safe: uses IF NOT EXISTS pattern via DO block

DO $$
BEGIN
  -- Rich tournament structure fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='level_duration_minutes') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN level_duration_minutes INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='bounty_amount') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN bounty_amount INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='satellite_to') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN satellite_to TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='min_players_to_run') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN min_players_to_run INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='registration_opens') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN registration_opens TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='online_registration_url') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN online_registration_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='structure_sheet_url') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN structure_sheet_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='number_of_levels') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN number_of_levels INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='payout_levels') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN payout_levels TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='age_requirement') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN age_requirement INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='timezone') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN timezone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='is_special_event') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN is_special_event BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='series_name') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN series_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='series_event_number') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN series_event_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='scrape_completeness_score') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN scrape_completeness_score INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='best_scrape_url') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN best_scrape_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='scrape_fail_count') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN scrape_fail_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='flags') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN flags JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='human_verified') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN human_verified BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='is_recurring') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN is_recurring BOOLEAN DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='venue_daily_tournaments' AND column_name='parent_tournament_id') THEN
    ALTER TABLE venue_daily_tournaments ADD COLUMN parent_tournament_id UUID;
  END IF;
END $$;

-- Index for completeness-score-based rescraping
CREATE INDEX IF NOT EXISTS idx_vdt_completeness ON venue_daily_tournaments(scrape_completeness_score, is_active);
CREATE INDEX IF NOT EXISTS idx_vdt_event_date ON venue_daily_tournaments(event_date, is_active);
CREATE INDEX IF NOT EXISTS idx_vdt_venue_recurring ON venue_daily_tournaments(venue_id, is_recurring);

SELECT 'Schema migration complete ✅' as status;
