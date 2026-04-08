-- Migration: Add all 34-field spec columns to tour_event_details
-- Smarter.Poker — Poker Tour Enrichment Upgrade

ALTER TABLE tour_event_details
  -- Core
  ADD COLUMN IF NOT EXISTS tournament_name        TEXT,
  ADD COLUMN IF NOT EXISTS format                 TEXT,
  ADD COLUMN IF NOT EXISTS event_date             DATE,
  ADD COLUMN IF NOT EXISTS blind_levels           TEXT,

  -- Prize & Structure
  ADD COLUMN IF NOT EXISTS bounty_amount          INTEGER,
  ADD COLUMN IF NOT EXISTS satellite_to           TEXT,
  ADD COLUMN IF NOT EXISTS payout_levels          TEXT,

  -- Tournament Structure
  ADD COLUMN IF NOT EXISTS starting_stack         INTEGER,
  ADD COLUMN IF NOT EXISTS level_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS number_of_levels       INTEGER,
  ADD COLUMN IF NOT EXISTS structure_sheet_url    TEXT,

  -- Registration & Rules
  ADD COLUMN IF NOT EXISTS late_registration      TEXT,
  ADD COLUMN IF NOT EXISTS rebuy_addon            TEXT,
  ADD COLUMN IF NOT EXISTS max_entries            INTEGER,
  ADD COLUMN IF NOT EXISTS min_players_to_run     INTEGER,
  ADD COLUMN IF NOT EXISTS registration_opens     TEXT,
  ADD COLUMN IF NOT EXISTS online_registration_url TEXT,
  ADD COLUMN IF NOT EXISTS age_requirement        INTEGER,

  -- Series & Special Events
  ADD COLUMN IF NOT EXISTS series_event_number    TEXT,
  ADD COLUMN IF NOT EXISTS is_special_event       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recurring           BOOLEAN DEFAULT false,

  -- Scraper Intelligence
  ADD COLUMN IF NOT EXISTS scrape_completeness_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_scrape_url        TEXT,
  ADD COLUMN IF NOT EXISTS scrape_fail_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flags                  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS human_verified         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_tournament_id   UUID,
  ADD COLUMN IF NOT EXISTS timezone               TEXT,
  ADD COLUMN IF NOT EXISTS source_url             TEXT,
  ADD COLUMN IF NOT EXISTS scrape_html_hash       TEXT,
  ADD COLUMN IF NOT EXISTS scrape_timestamp       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_quality           TEXT DEFAULT 'scraped_verified';

-- Also rename 'source' -> alias source_url for backwards compat
-- (keep source column, just add source_url separately)

-- Also rename starting_chips to starting_stack alias
-- (keep starting_chips, add starting_stack)
UPDATE tour_event_details
SET starting_stack = starting_chips
WHERE starting_stack IS NULL AND starting_chips IS NOT NULL;

-- Populate source_url from pdf_source_url / source
UPDATE tour_event_details
SET source_url = COALESCE(pdf_source_url, source)
WHERE source_url IS NULL;

-- Populate scrape_timestamp from scraped_at
UPDATE tour_event_details
SET scrape_timestamp = scraped_at
WHERE scrape_timestamp IS NULL AND scraped_at IS NOT NULL;

-- Populate data_quality
UPDATE tour_event_details
SET data_quality = 'scraped_verified'
WHERE data_quality IS NULL;

-- Compute initial completeness scores
-- Base fields: buy_in, game_type, start_time, series_name, event_name (5)
-- Rich fields: starting_chips, level_duration_minutes, rebuy_addon, late_registration,
--              guaranteed, format, max_entries, bounty_amount, structure_sheet_url,
--              payout_levels, age_requirement, timezone, tournament_name (13)
UPDATE tour_event_details
SET scrape_completeness_score = LEAST(100, ROUND(
    (
      (CASE WHEN buy_in               IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN game_type            IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN start_time           IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN series_name          IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN event_name           IS NOT NULL THEN 1 ELSE 0 END
      )::numeric / 5 * 30
    ) + (
      (CASE WHEN starting_chips       IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN level_duration_minutes IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN rebuy_addon          IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN late_registration    IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN guaranteed           IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN format               IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN max_entries          IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN bounty_amount        IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN structure_sheet_url  IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN payout_levels        IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN age_requirement      IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN timezone             IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN tournament_name      IS NOT NULL THEN 1 ELSE 0 END
      )::numeric / 13 * 70
    )
));

-- Indexes for enrichment pass
CREATE INDEX IF NOT EXISTS idx_ted_completeness
    ON tour_event_details (scrape_completeness_score ASC)
    WHERE human_verified = false;

CREATE INDEX IF NOT EXISTS idx_ted_tour_code
    ON tour_event_details (tour_code);

CREATE INDEX IF NOT EXISTS idx_ted_needs_enrich
    ON tour_event_details (tour_code, scrape_completeness_score)
    WHERE scrape_completeness_score < 60 AND human_verified = false;
