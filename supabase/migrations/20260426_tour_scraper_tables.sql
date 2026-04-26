-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Tour Schedule Scraper — NEW tables (avoids collision with
-- existing tour_source_registry venue-scraper table)
-- Phase: 2B.2 follow-up (Workers repo port)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. tour_schedule_registry — replaces data/tour-source-registry.json (70 KB read-write)
--    (note: tour_source_registry already exists with different schema for venue-scraper)
CREATE TABLE IF NOT EXISTS tour_schedule_registry (
  id              BIGSERIAL PRIMARY KEY,
  tour_name       TEXT NOT NULL UNIQUE,
  registry_data   JSONB NOT NULL DEFAULT '{}',
  events_count    INT,
  last_scraped    TIMESTAMPTZ,
  last_modified   TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tour_schedule_registry_tour_name ON tour_schedule_registry(tour_name);
CREATE INDEX IF NOT EXISTS idx_tour_schedule_registry_last_scraped ON tour_schedule_registry(last_scraped);

ALTER TABLE tour_schedule_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tour_schedule_registry_service" ON tour_schedule_registry;
CREATE POLICY "tour_schedule_registry_service"
  ON tour_schedule_registry FOR ALL USING (true) WITH CHECK (true);

-- 2. tour_schedule_sources — replaces data/tour-scrape-sources.json (18 KB read-only config)
CREATE TABLE IF NOT EXISTS tour_schedule_sources (
  id              BIGSERIAL PRIMARY KEY,
  tour_name       TEXT NOT NULL UNIQUE,
  sources_config  JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  pdf_only        BOOLEAN DEFAULT false,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tour_schedule_sources_active ON tour_schedule_sources(is_active);

ALTER TABLE tour_schedule_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tour_schedule_sources_service" ON tour_schedule_sources;
CREATE POLICY "tour_schedule_sources_service"
  ON tour_schedule_sources FOR ALL USING (true) WITH CHECK (true);

-- 3. tour_event_details already exists — just ensure columns are present
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS event_number INT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS guaranteed BIGINT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS starting_chips INT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS levels INT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS pdf_source_url TEXT;
ALTER TABLE tour_event_details ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'side_event';

-- 4. scraper_runs already exists — just ensure columns are present
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS tours_scraped INT DEFAULT 0;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS tours_updated INT DEFAULT 0;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS total_events INT DEFAULT 0;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS pdf_events_found INT DEFAULT 0;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS errors_count INT DEFAULT 0;
