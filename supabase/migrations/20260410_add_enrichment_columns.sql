-- =====================================================================
-- Poker Series Enrichment — 34-Field Schema Upgrade
-- Adds missing columns to poker_events and poker_series for full
-- tournament data coverage and MSPT card parity.
-- Safe: All columns are nullable or have defaults. Non-destructive.
-- =====================================================================

-- ── poker_events: 23 new columns ─────────────────────────────────────

-- Prize & Structure
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS bounty_amount integer;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS satellite_to text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS payout_levels text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS level_duration_minutes integer;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS number_of_levels integer;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS structure_sheet_url text;

-- Registration & Rules
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS rebuy_addon text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS max_entries integer;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS min_players_to_run integer;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS registration_opens text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS online_registration_url text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS age_requirement integer;

-- Series & Special Events
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS series_event_number text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS is_special_event boolean DEFAULT false;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;

-- Scraper Intelligence
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_completeness_score integer DEFAULT 0;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS best_scrape_url text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS scrape_fail_count integer DEFAULT 0;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS flags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS human_verified boolean DEFAULT false;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS parent_tournament_id uuid;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE poker_events ADD COLUMN IF NOT EXISTS day_of_week text;


-- ── poker_series: 12 new columns (MSPT card parity) ─────────────────

ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS main_event_buyin integer;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS main_event_guaranteed integer;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS total_guaranteed integer;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS tour_code text;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS series_type text DEFAULT 'regional';
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS total_events integer;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS structure_pdf_url text;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS schedule_pdf_url text;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE poker_series ADD COLUMN IF NOT EXISTS short_name text;
