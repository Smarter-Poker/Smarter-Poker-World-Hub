-- Add unique constraint to venue_daily_tournaments for idempotent upserts
-- Conflict key: venue_id + day_of_week + start_time + buy_in + game_type
-- (event_date-based one-offs use event_date instead of day_of_week)

-- First, clean up exact duplicates that would block constraint creation
DELETE FROM venue_daily_tournaments a
USING venue_daily_tournaments b
WHERE a.id > b.id
  AND a.venue_id IS NOT DISTINCT FROM b.venue_id
  AND a.venue_name = b.venue_name
  AND a.day_of_week = b.day_of_week
  AND a.start_time = b.start_time
  AND a.buy_in = b.buy_in
  AND a.game_type = b.game_type
  AND a.event_date IS NOT DISTINCT FROM b.event_date;

-- Add the unique constraint
ALTER TABLE venue_daily_tournaments
  DROP CONSTRAINT IF EXISTS venue_daily_tournaments_upsert_key;

ALTER TABLE venue_daily_tournaments
  ADD CONSTRAINT venue_daily_tournaments_upsert_key
  UNIQUE NULLS NOT DISTINCT (venue_id, venue_name, day_of_week, event_date, start_time, buy_in, game_type);
