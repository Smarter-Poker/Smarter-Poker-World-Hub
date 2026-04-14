-- Create a unified view linking daily tournaments, series, and tour events
-- for the Events Calendar discovery hub

CREATE OR REPLACE VIEW unified_events_calendar AS

-- 1. Daily Tournaments
SELECT 
  'daily' AS source,
  vdt.id::TEXT AS native_id,
  vdt.venue_name,
  vdt.venue_id::TEXT AS venue_id,
  NULL::TEXT AS series_id,
  NULL::TEXT AS tour_event_id,
  NULL::TEXT AS tour_code,
  vdt.tournament_name AS event_name,
  vdt.start_time,
  vdt.buy_in,
  vdt.game_type,
  vdt.guaranteed,
  vdt.format,
  vdt.starting_stack,
  vdt.day_of_week,
  vdt.event_date AS specific_date,
  vdt.is_recurring,
  vdt.is_suppressed,
  vdt.is_active,
  v.city,
  v.state,
  v.latitude,
  v.longitude,
  NULL::TEXT AS logo_url
FROM venue_daily_tournaments vdt
LEFT JOIN poker_venues v ON v.id = vdt.venue_id

UNION ALL

-- 2. Poker Series
SELECT 
  'series' AS source,
  ps.id::TEXT AS native_id,
  ps.venue_name,
  ps.venue_id::TEXT AS venue_id,
  ps.id::TEXT AS series_id,
  NULL::TEXT AS tour_event_id,
  ps.tour_code::TEXT,
  COALESCE(ps.series_name, ps.short_name) AS event_name,
  NULL::TEXT AS start_time,
  COALESCE(ps.main_event_buyin, ps.buy_in_min) AS buy_in,
  COALESCE(ps.series_type, 'NLH') AS game_type,
  COALESCE(ps.total_guaranteed, ps.main_event_guaranteed) AS guaranteed,
  NULL::TEXT AS format,
  NULL::TEXT AS starting_stack,
  NULL::TEXT AS day_of_week,
  ps.start_date AS specific_date,
  false AS is_recurring,
  ps.is_suppressed,
  true AS is_active,
  COALESCE(ps.city, v.city) AS city,
  COALESCE(ps.state, v.state) AS state,
  v.latitude,
  v.longitude,
  ps.logo_url::TEXT
FROM poker_series ps
LEFT JOIN poker_venues v ON v.id = ps.venue_id

UNION ALL

-- 3. Tour Stop Events
SELECT 
  'tour' AS source,
  tse.id::TEXT AS native_id,
  tse.stop_venue AS venue_name,
  NULL::TEXT AS venue_id,
  NULL::TEXT AS series_id,
  tse.id::TEXT AS tour_event_id,
  tse.tour_code::TEXT,
  COALESCE(tse.event_name, tse.stop_name) AS event_name,
  tse.start_time::TEXT,
  tse.buy_in,
  tse.game_type,
  tse.guarantee AS guaranteed,
  NULL::TEXT AS format,
  NULL::TEXT AS starting_stack,
  NULL::TEXT AS day_of_week,
  tse.start_date AS specific_date,
  false AS is_recurring,
  false AS is_suppressed,
  tse.is_active,
  tse.stop_city AS city,
  tse.stop_state AS state,
  NULL::numeric AS latitude,
  NULL::numeric AS longitude,
  NULL::TEXT AS logo_url
FROM tour_stop_events tse;
