-- Migration: Add event_date + new schedule columns to venue_daily_tournaments
-- Run in Supabase SQL editor or via supabase-sql workflow
-- Date: 2026-04-07

-- 1. Add event_date for specific calendar events (NULL = recurring weekly pattern)
ALTER TABLE venue_daily_tournaments
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS late_registration text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS max_entries integer;

-- 2. Add schedule source tracking columns to poker_venues
ALTER TABLE poker_venues
  ADD COLUMN IF NOT EXISTS schedule_scrape_url text,
  ADD COLUMN IF NOT EXISTS schedule_last_scraped_at timestamptz;

-- 3. Index for fast venue calendar queries (venue + date range)
CREATE INDEX IF NOT EXISTS idx_vdt_venue_date
  ON venue_daily_tournaments (venue_id, event_date)
  WHERE event_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vdt_venue_day
  ON venue_daily_tournaments (venue_id, day_of_week)
  WHERE event_date IS NULL;

-- 4. Index for scraper ordering (oldest-scraped-first)
CREATE INDEX IF NOT EXISTS idx_pv_schedule_scraped
  ON poker_venues (schedule_last_scraped_at ASC NULLS FIRST)
  WHERE has_tournaments = true AND is_active = true;

-- 5. View: venue_tournament_calendar — unified weekly + dated view
CREATE OR REPLACE VIEW venue_tournament_calendar AS
SELECT
  id,
  venue_id,
  venue_name,
  -- Recurring events: expand to next occurrence of day_of_week
  CASE
    WHEN event_date IS NULL THEN (
      CURRENT_DATE + (
        CASE day_of_week
          WHEN 'Monday'    THEN (1 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Tuesday'   THEN (2 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Wednesday' THEN (3 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Thursday'  THEN (4 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Friday'    THEN (5 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Saturday'  THEN (6 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          WHEN 'Sunday'    THEN (0 - EXTRACT(DOW FROM CURRENT_DATE)::int % 7 + 7) % 7
          ELSE 0
        END * INTERVAL '1 day'
      )::date
    )
    ELSE event_date
  END AS next_occurrence,
  day_of_week,
  event_date,
  start_time,
  tournament_name,
  buy_in,
  game_type,
  format,
  guaranteed,
  starting_stack,
  blind_levels,
  rebuy_addon,
  late_registration,
  source_url,
  last_scraped,
  is_active,
  CASE WHEN event_date IS NULL THEN 'recurring' ELSE 'dated' END AS schedule_type
FROM venue_daily_tournaments
WHERE is_active = true
  AND data_quality = 'scraped_verified';

-- 6. Grant read access to anon role for the view
GRANT SELECT ON venue_tournament_calendar TO anon;
GRANT SELECT ON venue_tournament_calendar TO authenticated;
