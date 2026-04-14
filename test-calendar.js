import { createClient } from '@supabase/supabase-js';

const sb = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs');

async function run() {
  try {
    let dq = sb.from('venue_daily_tournaments')
          .select('venue_id, venue_name, day_of_week, start_time, buy_in, game_type, tournament_name, guaranteed, starting_stack, format, event_date, is_recurring')
          .eq('is_active', true);
    let r1 = await dq.limit(5);
    if (r1.error) throw r1.error;
    console.log("Daily ok:", r1.data.length);
  } catch(e) { console.error("Daily ERROR:", e); }

  try {
    let sq = sb.from('poker_series')
          .select('id, series_name, venue_name, venue_id, city, state, start_date, end_date, buy_in_min, buy_in_max, main_event_buyin, total_guaranteed, main_event_guaranteed, tour_code, series_type, events_count, is_featured, short_name, logo_url')
          .not('start_date', 'is', null)
          .eq('is_suppressed', false);
    let r2 = await sq.limit(5);
    if (r2.error) throw r2.error;
    console.log("Series ok:", r2.data.length);
  } catch (e) { console.error("Series ERROR:", e); }

  try {
    let tq = sb.from('tour_stop_events')
          .select('id, tour_code, stop_name, stop_venue, stop_city, stop_state, event_name, start_date, start_time, buy_in, game_type, guarantee, is_main_event, is_high_roller');
    tq = tq.eq('is_active', true);
    let r3 = await tq.limit(5);
    if (r3.error) throw r3.error;
    console.log("Tour ok:", r3.data.length);
  } catch(e) { console.error("Tour ERROR:", e); }
}
run();
