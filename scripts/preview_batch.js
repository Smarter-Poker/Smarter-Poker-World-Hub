// Preview batch 1 — exactly what the daemon will process
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SKIP = new Set(['charity','charity_event','charity_game','series','poker_series','tour','poker_tour','traveling_tour','regional_tour','tournament_series']);

async function run() {
  const { data: rows } = await sb.from('poker_venues')
    .select('id,name,state,city,venue_type,website,poker_atlas_url,pokeratlas_slug,schedule_last_scraped_at,has_tournaments')
    .eq('has_tournaments', true)
    .eq('is_active', true)
    .order('schedule_last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(2000);

  const filtered = (rows || []).filter(v => !SKIP.has((v.venue_type || '').toLowerCase()));
  const batch1 = filtered.slice(0, 25);

  console.log('=== BATCH 1 — 25 venues to scrape ===');
  console.log(batch1.map((v, i) => 
    `${i+1}. [${v.id}] ${v.name} (${v.city}, ${v.state}) | slug=${v.pokeratlas_slug || 'NONE'} | last=${v.schedule_last_scraped_at || 'NEVER'}`
  ).join('\n'));
  
  const withSlug = batch1.filter(v => v.pokeratlas_slug);
  const withPA = batch1.filter(v => (v.poker_atlas_url||'').includes('pokeratlas.com'));
  const withWebsite = batch1.filter(v => v.website);
  
  console.log('\nSummary:');
  console.log('  Has PokerAtlas slug:', withSlug.length, '/ 25');
  console.log('  Has poker_atlas_url:', withPA.length, '/ 25');
  console.log('  Has website:', withWebsite.length, '/ 25');
}
run().catch(e => console.error('ERR:', e.message));
