// Check constraints on venue_daily_tournaments
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
);

async function run() {
  // Check columns
  const { data: cols } = await sb.from('venue_daily_tournaments').select().limit(1);
  if (cols && cols.length > 0) {
    console.log('All columns:', Object.keys(cols[0]));
  }
  
  // Try upsert with on_conflict parameter directly
  const testRec = {
    venue_name: 'TEST VENUE',
    venue_id: null,
    day_of_week: 'Monday',
    event_date: null,
    start_time: '7:00 PM',
    buy_in: 100,
    game_type: 'NLH',
    format: null,
    guaranteed: null,
    tournament_name: 'Test Tournament',
    source_url: 'https://test.com',
    data_quality: 'scraped_verified',
    is_active: true,
    last_scraped: new Date().toISOString(),
    scrape_timestamp: new Date().toISOString(),
  };
  
  // Try insert first to see what error we get
  const { data, error } = await sb.from('venue_daily_tournaments').insert(testRec);
  if (error) {
    console.log('\nInsert error:', error.code, error.message, error.details);
    console.log('Hint:', error.hint);
  } else {
    console.log('Insert succeeded:', data);
  }
}
run().catch(e => console.error('ERR:', e.message));
