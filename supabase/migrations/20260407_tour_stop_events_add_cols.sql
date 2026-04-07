-- Add missing provenance columns to tour_stop_events
-- These are captured by the scraper but were missing from initial schema

ALTER TABLE tour_stop_events 
  ADD COLUMN IF NOT EXISTS scrape_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS scrape_method TEXT DEFAULT 'Scrapling';
