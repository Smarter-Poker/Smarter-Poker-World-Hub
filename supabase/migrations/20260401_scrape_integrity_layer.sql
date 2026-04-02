-- =============================================================
-- SCRAPING INTEGRITY TRIGGER MIGRATION
-- Enforces the 15-Layer Scrapling Data Standard
-- =============================================================

-- Ensure NOT NULL constraints on provenance for venue_daily_tournaments
ALTER TABLE venue_daily_tournaments ALTER COLUMN scrape_html_hash SET NOT NULL;
ALTER TABLE venue_daily_tournaments ALTER COLUMN scrape_timestamp SET NOT NULL;

-- Add checking constraint to ensure no 'unverified' or fabricated data enters the system
ALTER TABLE venue_daily_tournaments ADD CONSTRAINT check_data_quality_provenance 
    CHECK (data_quality IN ('scraped_verified', 'stale', 'expired'));

-- Ensure NOT NULL constraints for poker_tour_series_events (Requires creation first)
CREATE TABLE IF NOT EXISTS poker_tour_series_events (
    id BIGSERIAL PRIMARY KEY,
    tour_code TEXT NOT NULL,         -- e.g., 'WSOP', 'MSPT'
    event_name TEXT NOT NULL,
    venue_name TEXT,
    location_address TEXT NOT NULL,  -- Mandatory Layer 2 check
    state TEXT,
    event_date DATE NOT NULL,
    buy_in NUMERIC,
    guaranteed NUMERIC,
    source_url TEXT NOT NULL,
    scrape_html_hash TEXT NOT NULL,
    scrape_timestamp TIMESTAMPTZ NOT NULL,
    scrape_batch_id UUID,
    data_quality TEXT DEFAULT 'scraped_verified' CHECK (data_quality IN ('scraped_verified', 'stale', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tour_code, event_name, event_date, buy_in)
);
ALTER TABLE poker_tour_series_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_poker_tour_events" ON poker_tour_series_events FOR SELECT USING (true);
CREATE POLICY "service_write_poker_tour_events" ON poker_tour_series_events FOR ALL USING (true) WITH CHECK (true);

-- Ensure NOT NULL constraints for charity_events_schedule
CREATE TABLE IF NOT EXISTS charity_events_schedule (
    id BIGSERIAL PRIMARY KEY,
    charity_name TEXT NOT NULL,
    venue_name TEXT,
    location_address TEXT NOT NULL,
    state TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    event_description TEXT,
    source_url TEXT NOT NULL,
    scrape_html_hash TEXT NOT NULL,
    scrape_timestamp TIMESTAMPTZ NOT NULL,
    scrape_batch_id UUID,
    data_quality TEXT DEFAULT 'scraped_verified' CHECK (data_quality IN ('scraped_verified', 'stale', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(charity_name, start_date, location_address)
);
ALTER TABLE charity_events_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_charity_events_schedule" ON charity_events_schedule FOR SELECT USING (true);
CREATE POLICY "service_write_charity_events_schedule" ON charity_events_schedule FOR ALL USING (true) WITH CHECK (true);

-- Trigger function enforcing that no payload gets past REST API without proper scrape provenance
CREATE OR REPLACE FUNCTION enforce_scrape_provenance()
RETURNS trigger AS $$
BEGIN
    IF NEW.scrape_html_hash IS NULL OR NEW.scrape_timestamp IS NULL THEN
        RAISE EXCEPTION 'CRITICAL VIOLATION: Cannot insert/update without scrape_html_hash and scrape_timestamp. (15-Layer Scrapling Web Scraper Integrity Standard)';
    END IF;
    
    IF NEW.data_quality NOT IN ('scraped_verified', 'stale', 'expired') THEN
        RAISE EXCEPTION 'CRITICAL VIOLATION: data_quality must be scraped_verified, stale, or expired.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to all tables
DROP TRIGGER IF EXISTS ensure_provenance_vdt ON venue_daily_tournaments;
CREATE TRIGGER ensure_provenance_vdt
    BEFORE INSERT OR UPDATE ON venue_daily_tournaments
    FOR EACH ROW EXECUTE FUNCTION enforce_scrape_provenance();

DROP TRIGGER IF EXISTS ensure_provenance_ptse ON poker_tour_series_events;
CREATE TRIGGER ensure_provenance_ptse
    BEFORE INSERT OR UPDATE ON poker_tour_series_events
    FOR EACH ROW EXECUTE FUNCTION enforce_scrape_provenance();

DROP TRIGGER IF EXISTS ensure_provenance_ces ON charity_events_schedule;
CREATE TRIGGER ensure_provenance_ces
    BEFORE INSERT OR UPDATE ON charity_events_schedule
    FOR EACH ROW EXECUTE FUNCTION enforce_scrape_provenance();
