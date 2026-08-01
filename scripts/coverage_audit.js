const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SKIP = new Set(['charity','charity_event','charity_game','series','poker_series','tour','poker_tour','traveling_tour','regional_tour','tournament_series']);

async function run() {
  const { data: venues } = await sb.from('poker_venues')
    .select('id,name,state,city,venue_type,website,poker_atlas_url,pokeratlas_slug,has_tournaments,schedule_last_scraped_at')
    .eq('is_active', true)
    .order('name')
    .limit(2000);

  const { data: tournCounts } = await sb.from('venue_daily_tournaments')
    .select('venue_id');

  const withRecs = new Set((tournCounts || []).map(r => r.venue_id));
  const cardRooms = (venues || []).filter(v => !SKIP.has((v.venue_type || '').toLowerCase()));
  const noRecs = cardRooms.filter(v => !withRecs.has(v.id));
  const hasRecs = cardRooms.filter(v => withRecs.has(v.id));

  console.log('=== COVERAGE SUMMARY ===');
  console.log('Total active venues:', venues?.length);
  console.log('Card rooms (not tour/series/charity):', cardRooms.length);
  console.log('Card rooms WITH records:', hasRecs.length);
  console.log('Card rooms WITHOUT records:', noRecs.length);
  console.log('Coverage:', Math.round((hasRecs.length / cardRooms.length) * 100) + '%');

  // Group by state
  const byState = {};
  for (const v of noRecs) {
    byState[v.state] = (byState[v.state] || 0) + 1;
  }
  const stateList = Object.entries(byState).sort((a,b) => b[1]-a[1]).slice(0,10);
  console.log('\nTop 10 states with missing coverage:', JSON.stringify(stateList));

  console.log('\nFirst 40 card rooms WITHOUT records:');
  console.log(JSON.stringify(noRecs.slice(0, 40).map(v => ({
    id: v.id, name: v.name, state: v.state, type: v.venue_type,
    slug: v.pokeratlas_slug, has_flag: v.has_tournaments
  })), null, 2));
}

run().catch(e => console.error('ERR:', e.message));
