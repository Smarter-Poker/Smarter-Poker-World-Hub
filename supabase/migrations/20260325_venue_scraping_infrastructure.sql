-- Venue Intelligence Scraping System — Schema Migration
-- Creates tables for daily tournaments, venue news, and scraper audit log

-- 1. Daily tournament schedules (replaces static JSON)
CREATE TABLE IF NOT EXISTS venue_daily_tournaments (
    id BIGSERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL,
    start_time TEXT,
    buy_in NUMERIC,
    game_type TEXT,
    format TEXT,
    guaranteed NUMERIC,
    starting_stack INTEGER,
    blind_levels TEXT,
    notes TEXT,
    source_url TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(venue_id, day_of_week, start_time, buy_in)
);

-- 2. Venue news/updates feed
CREATE TABLE IF NOT EXISTS venue_news (
    id BIGSERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    source_url TEXT,
    image_url TEXT,
    published_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- 3. Scraper run audit log
CREATE TABLE IF NOT EXISTS scraper_runs (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    stats JSONB,
    metadata JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_venue_id ON venue_daily_tournaments(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_day ON venue_daily_tournaments(day_of_week);
CREATE INDEX IF NOT EXISTS idx_venue_news_venue_id ON venue_news(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_news_active ON venue_news(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON scraper_runs(source);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_completed ON scraper_runs(completed_at);

-- 5. RLS policies
ALTER TABLE venue_daily_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY IF NOT EXISTS "venue_daily_tournaments_public_read"
    ON venue_daily_tournaments FOR SELECT
    USING (true);

CREATE POLICY IF NOT EXISTS "venue_news_public_read"
    ON venue_news FOR SELECT
    USING (is_active = true);

-- Service role insert/update for scrapers
CREATE POLICY IF NOT EXISTS "venue_daily_tournaments_service_write"
    ON venue_daily_tournaments FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "venue_news_service_write"
    ON venue_news FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "scraper_runs_service_write"
    ON scraper_runs FOR ALL
    USING (true)
    WITH CHECK (true);
