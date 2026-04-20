require('dotenv').config({ path: '.env.local' });
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function checkDb() {
  const headers = { 
    'apikey': ANON_KEY, 
    'Authorization': `Bearer ${ANON_KEY}`,
    'Range-Unit': 'items',
    'Prefer': 'return=representation'
  };
  
  // Get live venues
  let res = await fetch(`${SUPABASE_URL}/rest/v1/venue_live_tables?select=bravo_slug`, { headers });
  let liveTables = await res.json();
  
  let liveSlugs = liveTables.map(t => t.bravo_slug);
  console.log("Live Tables count:", liveSlugs.length);
  
  // Get all poker venues
  let vRes = await fetch(`${SUPABASE_URL}/rest/v1/poker_venues?select=id,latitude,longitude,bravo_slug,slug`, { headers });
  let venues = await vRes.json();
  console.log("Venues count:", venues.length);
  
  let unmapped = 0;
  for (let slug of liveSlugs) {
    let parent = venues.find(v => v.bravo_slug === slug || v.slug === slug || (slug.startsWith('pa-') && v.slug === slug.slice(3)));
    if (!parent) {
      unmapped++;
    } else if (!parent.latitude || !parent.longitude) {
      // mapped but no lat/lng
    }
  }
  console.log("Unmapped live venues:", unmapped);
}
checkDb().catch(console.error);
