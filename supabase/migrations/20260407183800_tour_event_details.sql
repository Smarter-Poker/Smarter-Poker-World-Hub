-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Tour Event Details Table
-- Purpose:   Store detailed per-event data extracted from PDF tour schedules.
--            Captures granular tournament info from MSPT, WSOP, WPT PDF files:
--            event number, start time, reg open, buy-in, guarantee, chips, levels.
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the detailed event storage table
CREATE TABLE IF NOT EXISTS tour_event_details (
    id                  BIGSERIAL PRIMARY KEY,

    -- Tour identification
    tour_code           TEXT NOT NULL,          -- e.g. 'MSPT', 'WSOP', 'WPT'
    series_name         TEXT,                   -- e.g. 'MSPT Minnesota State Poker Championship'

    -- Event identity
    event_number        INTEGER,                -- e.g. 7 (Event #7)
    event_number_raw    TEXT,                   -- raw value e.g. '7A' for flights
    event_name          TEXT NOT NULL,          -- e.g. '$1,110 No-Limit Hold em'
    game_type           TEXT,                   -- 'NLH', 'PLO', 'O8', 'HORSE', etc.
    event_type          TEXT,                   -- 'main_event', 'bounty', 'satellite', etc.

    -- Financial
    buy_in              INTEGER,                -- in dollars, e.g. 1110
    guaranteed          INTEGER,                -- guaranteed prize pool in dollars

    -- Schedule
    start_date          DATE,                   -- ISO date e.g. 2026-04-07
    day_of_week         TEXT,                   -- e.g. 'Tuesday'
    start_time          TEXT,                   -- e.g. '12:00 PM'
    reg_open_time       TEXT,                   -- e.g. '10:00 AM' (registration opens)

    -- Structure
    starting_chips      INTEGER,                -- e.g. 30000
    levels              INTEGER,                -- number of blind levels per day

    -- Source tracking
    pdf_source_url      TEXT,                   -- URL of the PDF this was extracted from
    source              TEXT DEFAULT 'pdf_extraction',
    scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: unique per tour + event name + buy-in
    CONSTRAINT tour_event_details_unique
        UNIQUE (tour_code, event_name, buy_in)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tour_event_details_tour_code
    ON tour_event_details (tour_code);

CREATE INDEX IF NOT EXISTS idx_tour_event_details_start_date
    ON tour_event_details (start_date);

CREATE INDEX IF NOT EXISTS idx_tour_event_details_buy_in
    ON tour_event_details (buy_in);

CREATE INDEX IF NOT EXISTS idx_tour_event_details_event_type
    ON tour_event_details (event_type);

CREATE INDEX IF NOT EXISTS idx_tour_event_details_scraped_at
    ON tour_event_details (scraped_at DESC);

-- RLS: allow public reads (tour schedules are public info)
ALTER TABLE tour_event_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_event_details_public_read"
    ON tour_event_details
    FOR SELECT
    TO public
    USING (true);

-- Service role has full write access (used by scraper cron)
CREATE POLICY "tour_event_details_service_write"
    ON tour_event_details
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add pdf_events_found and pdf_events_stored to scraper_runs if not present
ALTER TABLE scraper_runs
    ADD COLUMN IF NOT EXISTS pdf_events_found  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pdf_events_stored INTEGER DEFAULT 0;

-- Comment for documentation
COMMENT ON TABLE tour_event_details IS
    'Detailed per-event tournament data extracted from PDF schedule files published by MSPT, WSOP, WPT, and other poker tours. Populated by /api/cron/tour-schedule-scraper every 3 days.';

COMMENT ON COLUMN tour_event_details.tour_code IS 'Tour code matching tour-source-registry.json keys: MSPT, WSOP, WPT, WSOPC, etc.';
COMMENT ON COLUMN tour_event_details.buy_in IS 'Total buy-in amount in USD (includes rake). Null for free entry events.';
COMMENT ON COLUMN tour_event_details.guaranteed IS 'Guaranteed prize pool in USD. Null if no guarantee announced.';
COMMENT ON COLUMN tour_event_details.pdf_source_url IS 'The exact PDF URL this event was extracted from (e.g., msptpoker.com/showpdf.aspx?eventID=588).';
