-- Migration: Build Venue Daily Tournaments table with 15-layer integrity constraints

CREATE TABLE IF NOT EXISTS public.venue_daily_tournaments (
    -- Primary Keys & Links
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    venue_id bigint REFERENCES public.poker_venues(id) ON DELETE CASCADE,
    venue_name text NOT NULL,
    parent_tournament_id uuid, -- links all 10 dated copies of same recurring tourney
    is_recurring boolean DEFAULT false,
    
    -- Core Tournament Info
    tournament_name text NOT NULL,
    buy_in integer NOT NULL,
    game_type text NOT NULL, -- NLH / PLO / Mixed / Stud
    format text,             -- Bounty / Turbo / Deep Stack / Satellite / Rebuy / Freezeout
    day_of_week text,        -- Monday-Sunday or Daily
    event_date date,         -- specific YYYY-MM-DD
    start_time text NOT NULL,-- e.g. 7:00 PM
    
    -- Prize & Structure
    guaranteed integer,
    bounty_amount integer,
    satellite_to text,
    payout_levels text,
    
    -- Tournament Structure
    starting_stack integer,
    level_duration_minutes integer,
    number_of_levels integer,
    structure_sheet_url text,
    blind_levels text,
    
    -- Registration & Rules
    late_registration text,
    rebuy_addon text,
    max_entries integer,
    min_players_to_run integer,
    registration_opens text,
    online_registration_url text,
    age_requirement integer, -- 18 or 21
    
    -- Series & Special Events
    series_name text,
    series_event_number text,
    is_special_event boolean DEFAULT false,
    
    -- Venue & Timing
    timezone text, -- e.g. America/Chicago
    
    -- Scraper Intelligence (15-Layer Requirements)
    scrape_completeness_score integer CHECK (scrape_completeness_score >= 0 AND scrape_completeness_score <= 100),
    best_scrape_url text,
    source_url text NOT NULL,
    scrape_fail_count integer DEFAULT 0,
    flags jsonb DEFAULT '[]'::jsonb,
    human_verified boolean DEFAULT false,
    data_quality text NOT NULL CHECK (data_quality IN ('scraped_verified', 'stale', 'expired')),
    scrape_html_hash text NOT NULL,
    scrape_timestamp timestamp with time zone NOT NULL,
    scrape_batch_id text NOT NULL,

    -- Meta
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),

    -- Strict Conflict Constraint
    CONSTRAINT venue_daily_tournaments_upsert_key UNIQUE (venue_id, venue_name, day_of_week, event_date, start_time, buy_in, game_type)
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_venue_id ON public.venue_daily_tournaments (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_event_date ON public.venue_daily_tournaments (event_date);
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_score ON public.venue_daily_tournaments (scrape_completeness_score);

-- Enable RLS
ALTER TABLE public.venue_daily_tournaments ENABLE ROW LEVEL SECURITY;

-- PostgREST policy (Public Read, Service Role Write)
DROP POLICY IF EXISTS "Public can view active tournaments" ON public.venue_daily_tournaments;
CREATE POLICY "Public can view active tournaments" ON public.venue_daily_tournaments
    FOR SELECT USING (data_quality = 'scraped_verified');

-- Ensure triggers exist for the 15 layer standard!
-- If trigger `enforce_scrape_provenance` already exists on other tables, map it to this one.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_scrape_provenance_tournaments') THEN
        CREATE TRIGGER trg_enforce_scrape_provenance_tournaments
        BEFORE INSERT OR UPDATE ON public.venue_daily_tournaments
        FOR EACH ROW
        EXECUTE FUNCTION public.enforce_scrape_provenance();
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If the function enforce_scrape_provenance() doesn't exist yet, don't abort
    -- the migration — 20260401_scrape_integrity_layer.sql attaches its own
    -- ensure_provenance_vdt trigger once the function is created.
    RAISE NOTICE 'Skipped trg_enforce_scrape_provenance_tournaments: %', SQLERRM;
END
$$;
