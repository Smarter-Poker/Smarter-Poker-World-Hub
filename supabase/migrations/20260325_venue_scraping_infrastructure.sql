-- Venue Intelligence Scraping System — Schema Migration
-- Creates tables for daily tournaments, venue news, and scraper audit log
--
-- NOTE (fix): this file previously used `CREATE POLICY IF NOT EXISTS`, which is
-- not valid PostgreSQL. Every statement below the first policy aborted and the
-- whole (transactional) migration rolled back, so venue_news — which is created
-- in no other non-archive migration but is read by
-- pages/api/public/venue/[id].js and written by the scraper pipeline — never
-- existed. All policies now use the DROP POLICY IF EXISTS + CREATE POLICY
-- pattern already used in 20260408_create_venue_daily_tournaments.sql.

-- 1. Daily tournament schedules (replaces static JSON)
--
-- NOTE (fix): the authoritative definition of venue_daily_tournaments lives in
-- 20260408_create_venue_daily_tournaments.sql (uuid primary key, provenance
-- columns, upsert constraint). The stale BIGSERIAL definition that used to live
-- here was a `CREATE TABLE IF NOT EXISTS` with an incompatible shape — because
-- this file sorts earlier it would have won the race and permanently shadowed
-- the canonical table (later migrations such as
-- 20260409180000_dedup_venue_daily_tournaments.sql document the id column as
-- UUID). It is intentionally not re-declared here; only the extra indexes and
-- RLS enablement are applied, and only if the table already exists.

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
CREATE INDEX IF NOT EXISTS idx_venue_news_venue_id ON venue_news(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_news_active ON venue_news(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scraper_runs_source ON scraper_runs(source);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_completed ON scraper_runs(completed_at);

-- 4b. venue_daily_tournaments extras — guarded so this file applies cleanly
--     whether or not the canonical table has been created yet.
DO $$
BEGIN
    IF to_regclass('public.venue_daily_tournaments') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_venue_id
            ON venue_daily_tournaments(venue_id);
        CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_day
            ON venue_daily_tournaments(day_of_week);
        ALTER TABLE venue_daily_tournaments ENABLE ROW LEVEL SECURITY;
        -- Read/write policies for this table are owned by
        -- 20260408_create_venue_daily_tournaments.sql (public read is scoped to
        -- data_quality = 'scraped_verified') and
        -- 20260520000005_final_permissive_policy_cleanup.sql (service_role write).
        -- Deliberately not re-declared here so this file cannot widen them.
    END IF;
END $$;

-- 5. RLS policies
ALTER TABLE venue_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

-- Public read access
DROP POLICY IF EXISTS "venue_news_public_read" ON venue_news;
CREATE POLICY "venue_news_public_read"
    ON venue_news FOR SELECT
    USING (is_active = true);

-- Service role insert/update for scrapers
DROP POLICY IF EXISTS "venue_news_service_write" ON venue_news;
CREATE POLICY "venue_news_service_write"
    ON venue_news FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "scraper_runs_service_write" ON scraper_runs;
CREATE POLICY "scraper_runs_service_write"
    ON scraper_runs FOR ALL
    USING (true)
    WITH CHECK (true);
