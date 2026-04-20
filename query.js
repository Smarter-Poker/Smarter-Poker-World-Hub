require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: venues } = await sb.from('poker_venues').select('id, name, latitude, longitude, bravo_slug, slug').limit(5000);
  const { data: liveData } = await sb.from('venue_live_tables').select('bravo_slug, venue_name').limit(5000);
  let liveSlugs = new Set(liveData.map(d => d.bravo_slug));
  console.log('Total venues:', venues?.length);
  console.log('Total live venues:', liveSlugs.size);
  let unmapped = [];
  for (let l of liveData) {
     let mapped = venues.find(v => v.bravo_slug === l.bravo_slug || v.slug === l.bravo_slug || (l.bravo_slug.startsWith("pa-") && v.slug === l.bravo_slug.slice(3)));
     if (!mapped) unmapped.push(l);
  }
  console.log('Unmapped live venues:', unmapped.length);
  console.log('First 5 unmapped:', unmapped.slice(0, 5));
}
run();
