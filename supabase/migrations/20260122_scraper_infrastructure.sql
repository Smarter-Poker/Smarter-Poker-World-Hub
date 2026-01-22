-- ============================================================
-- SCRAPER INFRASTRUCTURE MIGRATION
-- Adds columns for tracking scrape sources and schedules
-- Run: 2026-01-22
-- ============================================================

-- Add scrape tracking columns to poker_venues
ALTER TABLE poker_venues
ADD COLUMN IF NOT EXISTS pokeratlas_url TEXT,
ADD COLUMN IF NOT EXISTS pokeratlas_slug TEXT,
ADD COLUMN IF NOT EXISTS scrape_url TEXT,
ADD COLUMN IF NOT EXISTS scrape_source TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending';

-- Add scrape tracking columns to tournament_series
ALTER TABLE tournament_series
ADD COLUMN IF NOT EXISTS scrape_url TEXT,
ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending';

-- Create venue_daily_tournaments table for daily/nightly events
CREATE TABLE IF NOT EXISTS venue_daily_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
    venue_name TEXT NOT NULL,

    -- Schedule
    day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Daily')),
    start_time TEXT NOT NULL, -- '11:00 AM', '7:00 PM', etc.

    -- Tournament Details
    tournament_name TEXT,
    buy_in INTEGER NOT NULL,
    rebuy_addon TEXT,          -- '$20 rebuy, $40 addon'
    starting_stack INTEGER,
    blind_levels TEXT,         -- '15 min', '20 min'
    guaranteed INTEGER,        -- Guaranteed prize pool

    -- Game Info
    game_type TEXT DEFAULT 'NLH',
    format TEXT,               -- 'Turbo', 'Deep Stack', 'Bounty'

    -- Source tracking
    source_url TEXT,
    last_scraped TIMESTAMPTZ DEFAULT NOW(),

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint to prevent duplicates
    UNIQUE(venue_id, day_of_week, start_time, buy_in)
);

-- Create poker_events table for individual tournament series events
CREATE TABLE IF NOT EXISTS poker_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_uid TEXT UNIQUE NOT NULL,      -- 'WSOPC-TV-2026-01'
    series_id UUID REFERENCES tournament_series(id) ON DELETE CASCADE,

    -- Event Details
    event_number INTEGER,
    event_name TEXT NOT NULL,
    event_type TEXT,             -- 'main_event', 'side_event', 'satellite', 'high_roller'

    -- Money
    buy_in INTEGER NOT NULL,
    fee INTEGER,                  -- Rake/fee portion
    guaranteed BIGINT,
    prize_pool BIGINT,            -- Actual if known

    -- Schedule
    start_date DATE NOT NULL,
    start_time TIME,
    day_number INTEGER,           -- Day 1, Day 2, etc.
    flight TEXT,                  -- 'A', 'B', 'C' for multi-flight

    -- Game Info
    game_type TEXT DEFAULT 'NLH',
    format TEXT,                  -- 'Single Day', 'Multi-Day', 'Multi-Flight'
    starting_stack INTEGER,
    blind_levels TEXT,

    -- Location (can differ from series)
    venue_name TEXT,
    city TEXT,
    state TEXT,

    -- Source tracking
    source_url TEXT,
    last_scraped TIMESTAMPTZ DEFAULT NOW(),

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE venue_daily_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_events ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY IF NOT EXISTS "Public read daily tournaments" ON venue_daily_tournaments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read poker events" ON poker_events FOR SELECT USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_tournaments_venue ON venue_daily_tournaments(venue_id);
CREATE INDEX IF NOT EXISTS idx_daily_tournaments_day ON venue_daily_tournaments(day_of_week);
CREATE INDEX IF NOT EXISTS idx_poker_events_series ON poker_events(series_id);
CREATE INDEX IF NOT EXISTS idx_poker_events_date ON poker_events(start_date);
CREATE INDEX IF NOT EXISTS idx_poker_events_buyin ON poker_events(buy_in);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Check column additions
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'poker_venues'
  AND column_name IN ('pokeratlas_url', 'last_scraped', 'scrape_status');
