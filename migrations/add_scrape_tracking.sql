-- Migration: Add scrape tracking columns to poker_series
-- Run this in Supabase SQL Editor

-- Add columns for tracking scrape status
ALTER TABLE poker_series 
ADD COLUMN IF NOT EXISTS events_scraped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scrape_url TEXT,
ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending';

-- Add check constraint for scrape_status
ALTER TABLE poker_series
DROP CONSTRAINT IF EXISTS valid_scrape_status;

ALTER TABLE poker_series
ADD CONSTRAINT valid_scrape_status 
CHECK (scrape_status IN ('pending', 'complete', 'failed', 'no_schedule', 'no_scraper'));

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_poker_series_scrape_status 
ON poker_series(events_scraped, last_scraped, start_date);

-- Update existing series with WSOP Circuit complete schedules
UPDATE poker_series 
SET events_scraped = true, 
    scrape_status = 'complete',
    last_scraped = NOW()
WHERE series_uid LIKE 'wsopc-thunder-valley%'
   OR series_uid LIKE 'wsopc-horseshoe-tunica-jan%'
   OR series_uid LIKE 'wsopc-harrahs-pompano%'
   OR series_uid LIKE 'wsopc-harrahs-cherokee-feb%'
   OR series_uid LIKE 'wsopc-horseshoe-baltimore%'
   OR series_uid LIKE 'wsopc-horseshoe-hammond%'
   OR series_uid LIKE 'wsopc-turning-stone%';

-- Mark series with pending schedules
UPDATE poker_series
SET scrape_status = 'no_schedule'
WHERE tour = 'WSOP Circuit'
  AND events_scraped = false
  AND start_date > '2026-03-01';

-- Verify
SELECT series_name, events_scraped, scrape_status, last_scraped
FROM poker_series
WHERE tour = 'WSOP Circuit'
ORDER BY start_date;
