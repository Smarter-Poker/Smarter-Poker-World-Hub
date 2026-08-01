const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SKIP = new Set(['charity','charity_event','charity_game','series','poker_series','tour','poker_tour','traveling_tour','regional_tour','tournament_series']);

async function run() {
  // Count venues by has_tournaments flag
  const { data: all } = await sb.from('poker_venues')
    .select('id,name,state,venue_type,has_tournaments,pokeratlas_slug,poker_atlas_url')
    .eq('is_active', true)
    .limit(2000);

  const cardRooms = (all || []).filter(v => !SKIP.has((v.venue_type || '').toLowerCase()));
  
  const withTrue = cardRooms.filter(v => v.has_tournaments === true);
  const withFalse = cardRooms.filter(v => v.has_tournaments === false);
  const withNull = cardRooms.filter(v => v.has_tournaments === null || v.has_tournaments === undefined);

  console.log('=== has_tournaments flag distribution for card rooms ===');
  console.log('has_tournaments = TRUE:', withTrue.length, '(daemon WILL process these)');
  console.log('has_tournaments = FALSE:', withFalse.length, '(daemon SKIPS these)');
  console.log('has_tournaments = NULL:', withNull.length, '(daemon SKIPS these)');

  // Of those skipped — how many have PokerAtlas slugs?
  const skipped = [...withFalse, ...withNull];
  const withSlug = skipped.filter(v => v.pokeratlas_slug || (v.poker_atlas_url || '').includes('pokeratlas.com'));
  console.log('\nSkipped venues WITH a PokerAtlas slug (guaranteed data available):', withSlug.length);
  console.log('Sample skipped with slugs:', JSON.stringify(withSlug.slice(0, 15).map(v => ({
    id: v.id, name: v.name, state: v.state, slug: v.pokeratlas_slug, flag: v.has_tournaments
  })), null, 2));
}

run().catch(e => console.error('ERR:', e.message));
