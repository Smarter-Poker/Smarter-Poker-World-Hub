-- Drop the legacy 4-column constraint that conflicts with the new 7-column constraint during upserts.
ALTER TABLE venue_daily_tournaments
  DROP CONSTRAINT IF EXISTS venue_daily_tournaments_venue_id_day_of_week_start_time_buy_in_key;
