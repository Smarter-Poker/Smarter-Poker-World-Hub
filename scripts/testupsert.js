const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://kuklfnapbkmacvwxktbh.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testUpsert() {
  const rec = {
    venue_name: 'Lucky Chances Casino',
    venue_id: 1950,
    day_of_week: 'Daily',
    event_date: null,
    start_time: '1:00 PM',
    buy_in: 60,
    game_type: 'NLH',
    tournament_name: 'Test Tournament',
    source_url: 'https://test.com',
    data_quality: 'scraped_verified',
    is_active: true,
    last_scraped: new Date().toISOString(),
    scrape_timestamp: new Date().toISOString(),
    scrape_html_hash: '12345',
    scrape_batch_id: 'upsert-fix-test',
  };
  
  // Test with 7 columns
  const params = 'venue_id,venue_name,day_of_week,event_date,start_time,buy_in,game_type';
  const { error: err1 } = await sb.from('venue_daily_tournaments').upsert(rec, { onConflict: params });
  console.log('7-col test:', err1 ? err1.message : 'SUCCESS');
}
testUpsert();
