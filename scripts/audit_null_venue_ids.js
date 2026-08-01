// Deep audit: check null venue_id records, and match by venue_name
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SKIP = new Set(['charity','charity_event','charity_game','series','poker_series','tour','poker_tour','traveling_tour','regional_tour','tournament_series']);

async function run() {
  // How many tournament records have null venue_id?
  const { count: nullIdCount } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true })
    .is('venue_id', null);

  const { count: withIdCount } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true })
    .not('venue_id', 'is', null);

  const { count: total } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true });

  console.log('=== venue_daily_tournaments audit ===');
  console.log('Total records:', total);
  console.log('Records WITH venue_id:', withIdCount);
  console.log('Records with NULL venue_id:', nullIdCount);

  // Get distinct venue_names in tournament table (unlinked)
  const { data: nullRecs } = await sb.from('venue_daily_tournaments')
    .select('venue_name')
    .is('venue_id', null)
    .limit(1000);

  const distinctNames = [...new Set((nullRecs||[]).map(r => r.venue_name))];
  console.log('\nDistinct venue_names with null venue_id:', distinctNames.length);
  console.log('Sample:', distinctNames.slice(0, 20));

  // Now check: how many of these null-id records match actual venues?
  const { data: venues } = await sb.from('poker_venues')
    .select('id,name')
    .eq('is_active', true)
    .limit(2000);

  const nameToId = {};
  for (const v of venues || []) nameToId[v.name.trim().toLowerCase()] = v.id;

  let matchable = 0;
  for (const n of distinctNames) {
    if (nameToId[n?.trim().toLowerCase()]) matchable++;
  }
  console.log('Null-venue_id names that CAN be matched to a venue:', matchable, '/', distinctNames.length);
}
run().catch(e => console.error('ERR:', e.message));
