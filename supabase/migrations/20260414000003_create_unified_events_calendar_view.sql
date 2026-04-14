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
  vdt.start_time::TEXT,
  vdt.buy_in::NUMERIC,
  vdt.game_type::TEXT,
  vdt.guaranteed::NUMERIC,
  vdt.format::TEXT,
  vdt.starting_stack::TEXT,
  vdt.day_of_week::TEXT,
  vdt.event_date::TEXT AS specific_date,
  vdt.is_recurring::BOOLEAN,
  vdt.is_suppressed::BOOLEAN,
  vdt.is_active::BOOLEAN,
  v.city::TEXT,
  v.state::TEXT,
  v.latitude::NUMERIC,
  v.longitude::NUMERIC,
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
  COALESCE(ps.main_event_buyin, ps.buy_in_min)::NUMERIC AS buy_in,
  COALESCE(ps.series_type, 'NLH')::TEXT AS game_type,
  COALESCE(ps.total_guaranteed, ps.main_event_guaranteed)::NUMERIC AS guaranteed,
  NULL::TEXT AS format,
  NULL::TEXT AS starting_stack,
  NULL::TEXT AS day_of_week,
  ps.start_date::TEXT AS specific_date,
  false::BOOLEAN AS is_recurring,
  ps.is_suppressed::BOOLEAN,
  true::BOOLEAN AS is_active,
  COALESCE(ps.city, v.city)::TEXT AS city,
  COALESCE(ps.state, v.state)::TEXT AS state,
  v.latitude::NUMERIC,
  v.longitude::NUMERIC,
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
  tse.buy_in::NUMERIC,
  tse.game_type::TEXT,
  tse.guarantee::NUMERIC AS guaranteed,
  NULL::TEXT AS format,
  NULL::TEXT AS starting_stack,
  NULL::TEXT AS day_of_week,
  tse.start_date::TEXT AS specific_date,
  false::BOOLEAN AS is_recurring,
  false::BOOLEAN AS is_suppressed,
  true::BOOLEAN AS is_active,
  tse.stop_city::TEXT AS city,
  tse.stop_state::TEXT AS state,
  NULL::NUMERIC AS latitude,
  NULL::NUMERIC AS longitude,
  NULL::TEXT AS logo_url
FROM tour_stop_events tse;
