const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Count total venues
  const { count: vCount } = await sb.from('poker_venues').select('*', { count: 'exact', head: true });
  
  // Daily venues
  const { data: daily } = await sb.from('venue_daily_tournaments').select('venue_uid');
  const dSet = new Set(daily.map(d => d.venue_uid));
  
  // Series venues
  const { data: events } = await sb.from('poker_events').select('series_uid');
  const seriesUids = [...new Set(events.map(e => e.series_uid))];
  
  // For each series, get the venue
  const { data: series } = await sb.from('poker_series').select('series_uid, venue_uid').in('series_uid', seriesUids);
  const sSet = new Set(series.map(s => s.venue_uid).filter(Boolean));
  
  const combined = new Set([...dSet, ...sSet]);
  
  console.log(`--- VENUE COMPREHENSIVE STATS ---`);
  console.log(`Total Venues in Database:        ${vCount}`);
  console.log(`Venues with Daily Tournaments:   ${dSet.size}`);
  console.log(`Venues with Scraped Poker Series: ${sSet.size}`);
  console.log(`TOTAL VENUES WITH ACTIVE POKER:  ${combined.size}`);
  
  console.log(`\n--- AUTHENTICITY CHECK ---`);
  // Get 10 random events and show oddness
  const { data: evts } = await sb.from('poker_events').select('event_name,buy_in,start_time,game_type,scrape_html_hash').limit(500);
  
  const shuffled = evts.sort(() => 0.5 - Math.random());
  for(let i=0; i<5; i++) {
    const e = shuffled[i];
    console.log(`  ${i+1}. ${e.start_time} | $${e.buy_in} | ${e.game_type}`);
    console.log(`     Name: ${e.event_name}`);
    console.log(`     Hash: ${e.scrape_html_hash.substring(0,10)}`);
  }
  
  const oddTime = evts.filter(e => e.start_time && !e.start_time.includes(':00') && !e.start_time.includes(':30')).length;
  console.log(`\nMetrics of Authentic Organic Data (Sample size 500):`);
  console.log(`  - Events starting on non-standard minutes (e.g. 11:15 AM): ${oddTime} events`);
  const buyins = [...new Set(evts.map(e => e.buy_in))].filter(b => b%100 !== 0 && b > 0);
  console.log(`  - Non-round irregular buy-ins scraped: ${buyins.slice(0, 10).join(', ')}`);
}
run();
