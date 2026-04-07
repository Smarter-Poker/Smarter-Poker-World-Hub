-- Smarter.Poker Tour Stop Events Table
-- WRITE LAST per completion protocol (SQL migrations run after production verification)
-- Run via: Supabase Dashboard > SQL Editor

-- ══════════════════════════════════════════════════════════════════
-- TABLE: tour_stop_events
-- PURPOSE: Per-event granular data for all 13 active poker tours
--          Every stop, every event, every buy-in, start time, chip stack
--          SOURCE OF TRUTH: scrape_url on every row points to where we got the data
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tour_stop_events (
  -- Identity
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_code            TEXT NOT NULL,              -- e.g. 'WSOP', 'MSPT', 'WPT'
  
  -- Stop / Series Info
  stop_name            TEXT NOT NULL,              -- e.g. '2026 WSOP Main Series', 'MSPT Running Aces'
  stop_venue           TEXT,                       -- e.g. 'Horseshoe Las Vegas'
  stop_city            TEXT,                       -- e.g. 'Las Vegas'
  stop_state           TEXT,                       -- e.g. 'NV' or 'Bahamas'
  stop_start_date      DATE,
  stop_end_date        DATE,
  
  -- Event Info  
  event_number         INTEGER,                    -- Event #1, #2, etc.
  event_name           TEXT NOT NULL,              -- Full event name
  game_type            TEXT,                       -- NLH, PLO, O8, Stud, HORSE, Mixed, etc.
  
  -- Buy-In / Financials (in whole dollars, source of truth)
  buy_in               INTEGER,                    -- e.g. 1500 = $1,500
  entry_fee            INTEGER,                    -- Rake / registration fee
  guarantee            INTEGER,                    -- Guaranteed prize pool in dollars
  
  -- Structure
  starting_chips       INTEGER,                    -- Starting chip count e.g. 50000
  blind_levels_min     INTEGER,                    -- Blind level duration in minutes
  late_reg_levels      INTEGER,                    -- Number of levels late registration is open
  
  -- Timing
  start_date           DATE,                       -- Event start date
  start_time           TEXT,                       -- e.g. '10:00 AM' (local time, text)
  
  -- Format Flags
  is_main_event        BOOLEAN DEFAULT FALSE,
  is_multi_day         BOOLEAN DEFAULT FALSE,
  re_entry             BOOLEAN DEFAULT FALSE,
  is_high_roller       BOOLEAN DEFAULT FALSE,
  is_ladies_event      BOOLEAN DEFAULT FALSE,
  is_seniors_event     BOOLEAN DEFAULT FALSE,
  day_1_flights        TEXT[],                     -- e.g. ARRAY['Day 1A', 'Day 1B']
  notes                TEXT,
  
  -- ── 15-LAYER PROVENANCE (MANDATORY) ────────────────────────────
  -- SOURCE OF TRUTH: These fields tell us EXACTLY where to re-scrape
  source_url           TEXT NOT NULL,              -- Exact page URL data was scraped from
  scrape_url           TEXT NOT NULL,              -- Same as source_url (explicit scrape field)
  scrape_html_hash     TEXT NOT NULL,              -- SHA-256 of raw HTML at scrape time
  scrape_timestamp     TIMESTAMPTZ NOT NULL,       -- UTC timestamp of scrape
  scrape_byte_count    INTEGER,
  scrape_script        TEXT,                       -- Script that produced this record
  data_quality         TEXT NOT NULL DEFAULT 'scraped_verified'
                       CHECK (data_quality IN ('scraped_verified', 'stale', 'expired', 'pending')),
  
  -- Audit
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tour_stop_events_tour_code 
  ON tour_stop_events(tour_code);
CREATE INDEX IF NOT EXISTS idx_tour_stop_events_start_date 
  ON tour_stop_events(start_date);
CREATE INDEX IF NOT EXISTS idx_tour_stop_events_stop_name 
  ON tour_stop_events(stop_name);
CREATE INDEX IF NOT EXISTS idx_tour_stop_events_tour_start 
  ON tour_stop_events(tour_code, start_date);
CREATE INDEX IF NOT EXISTS idx_tour_stop_events_main_event 
  ON tour_stop_events(is_main_event) WHERE is_main_event = TRUE;

-- ── Trigger: auto-update updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_tour_stop_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tour_stop_events_updated_at ON tour_stop_events;
CREATE TRIGGER set_tour_stop_events_updated_at
  BEFORE UPDATE ON tour_stop_events
  FOR EACH ROW EXECUTE FUNCTION update_tour_stop_events_updated_at();

-- ── Trigger: enforce provenance on every INSERT / UPDATE ──────────────────────
CREATE OR REPLACE FUNCTION enforce_tour_scrape_provenance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scrape_html_hash IS NULL OR NEW.scrape_html_hash = '' THEN
    RAISE EXCEPTION 'tour_stop_events: scrape_html_hash required on all records';
  END IF;
  IF NEW.scrape_timestamp IS NULL THEN
    RAISE EXCEPTION 'tour_stop_events: scrape_timestamp required on all records';
  END IF;
  IF NEW.source_url IS NULL OR NEW.source_url = '' THEN
    RAISE EXCEPTION 'tour_stop_events: source_url required — must capture where data was scraped from';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_tour_scrape_provenance ON tour_stop_events;
CREATE TRIGGER enforce_tour_scrape_provenance
  BEFORE INSERT OR UPDATE ON tour_stop_events
  FOR EACH ROW EXECUTE FUNCTION enforce_tour_scrape_provenance();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tour_stop_events ENABLE ROW LEVEL SECURITY;
-- Public read access (anyone can read tour schedules)
CREATE POLICY "tour_stop_events_public_read"
  ON tour_stop_events FOR SELECT
  USING (TRUE);
-- Only service role can write
CREATE POLICY "tour_stop_events_service_write"
  ON tour_stop_events FOR ALL
  USING (auth.role() = 'service_role');

-- ── Also add source_url registry table for future scraping ────────────────────
-- This stores the canonical URL for each tour so scraping can always be rerun
CREATE TABLE IF NOT EXISTS tour_scrape_registry (
  tour_code            TEXT PRIMARY KEY,
  tour_name            TEXT NOT NULL,
  primary_scrape_url   TEXT NOT NULL,
  fallback_urls        TEXT[],
  scrape_method        TEXT DEFAULT 'Fetcher',  -- 'Fetcher' or 'StealthySession'
  is_cloudflare        BOOLEAN DEFAULT FALSE,
  refresh_interval_days INTEGER DEFAULT 3,
  last_scraped_at      TIMESTAMPTZ,
  last_scrape_status   TEXT,
  last_event_count     INTEGER,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the 13 active tours into the scrape registry
INSERT INTO tour_scrape_registry 
  (tour_code, tour_name, primary_scrape_url, fallback_urls, scrape_method, is_cloudflare)
VALUES
  ('WSOP',       'World Series of Poker',        'https://www.wsop.com/tournaments/',
   ARRAY['https://www.wsop.com/2026/', 'https://www.pokeratlas.com/poker-tournaments/wsop'],
   'StealthySession', TRUE),
  ('WPT',        'World Poker Tour',             'https://www.worldpokertour.com/schedule/',
   ARRAY['https://www.worldpokertour.com/wpt-prime/', 'https://www.pokeratlas.com/poker-tournaments/wpt'],
   'StealthySession', TRUE),
  ('WSOPC',      'WSOP Circuit',                 'https://www.wsop.com/circuit/',
   ARRAY['https://www.pokeratlas.com/poker-tournaments/wsopc'],
   'StealthySession', TRUE),
  ('MSPT',       'Mid-States Poker Tour',        'https://msptpoker.com/schedule/',
   ARRAY['https://msptpoker.com/events/', 'https://www.pokeratlas.com/poker-tournaments/mspt'],
   'Fetcher', FALSE),
  ('RGPS',       'RunGood Poker Series',         'https://rungoodgear.com/poker-series/',
   ARRAY['https://rungoodgear.com/events/', 'https://www.pokeratlas.com/poker-tournaments/rgps'],
   'Fetcher', FALSE),
  ('PGT',        'PokerGO Tour',                 'https://www.pokergo.com/series',
   ARRAY['https://pokergo.com/articles'],
   'StealthySession', TRUE),
  ('NAPT',       'North American Poker Tour',    'https://www.pokerstarslive.com/napt/',
   ARRAY['https://pokernews.com/tours/napt/'],
   'StealthySession', TRUE),
  ('CPPT',       'Card Player Poker Tour',       'https://www.cardplayerpokertour.com/schedule',
   ARRAY['https://www.cardplayer.com/tours/cppt', 'https://www.pokeratlas.com/poker-tournaments/cppt'],
   'Fetcher', FALSE),
  ('ROUGHRIDER', 'Roughrider Poker Tour',        'https://roughriderpokertour.com/schedule/',
   ARRAY['https://roughriderpokertour.com/events/'],
   'Fetcher', FALSE),
  ('FPN',        'Free Poker Network',           'https://freepokernet.com/schedule',
   ARRAY['https://freepokernetwork.com/schedule/', 'https://freepokernetwork.com'],
   'Fetcher', FALSE),
  ('LIPS',       'Ladies International Poker Series', 'https://www.lipspoker.org/schedule',
   ARRAY['https://www.lipspoker.org'],
   'Fetcher', FALSE),
  ('PAT',        'PokerAtlas Tour',              'https://pokeratlastour.com/schedule',
   ARRAY['https://www.pokeratlas.com/poker-tournaments/pat'],
   'StealthySession', FALSE),
  ('GCPT',       'Gulf Coast Poker Tour',        'https://gulfcoastpoker.net/schedule/',
   ARRAY['https://gulfcoastpoker.net/events/'],
   'Fetcher', FALSE)
ON CONFLICT (tour_code) DO UPDATE SET
  primary_scrape_url = EXCLUDED.primary_scrape_url,
  fallback_urls = EXCLUDED.fallback_urls,
  updated_at = NOW();

COMMENT ON TABLE tour_stop_events IS 
  'Per-event data for all 13 Smarter.Poker active tours. Scraped via Scrapling + camoufox.
   SOURCE OF TRUTH: source_url / scrape_url fields contain the exact page data was extracted from.
   To refresh: run scripts/scrape_tour_full_schedules.py';

COMMENT ON TABLE tour_scrape_registry IS
  'Canonical scraping source registry for all 13 active tours.
   Contains the authoritative URLs to re-scrape from in the future.';
