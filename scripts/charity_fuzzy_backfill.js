/**
 * Smart fuzzy backfill: match VDT venue_name to poker_venues.name
 * using substring / normalized comparison
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const normalize = s => (s || '').toLowerCase()
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

(async () => {
  // Get all charity venues
  const { data: charities } = await sb.from('poker_venues')
    .select('id, name')
    .eq('venue_type', 'charity')
    .eq('is_active', true);
  
  // Get all distinct venue_name values from VDT where venue_id is null
  const { data: vdtNames } = await sb.from('venue_daily_tournaments')
    .select('venue_name')
    .is('venue_id', null);
  
  const uniqueVdtNames = [...new Set((vdtNames || []).map(r => r.venue_name))].filter(Boolean);
  console.log('\n=== VDT null-venue_id names ===');
  uniqueVdtNames.forEach(n => console.log(' VDT:', JSON.stringify(n)));
  
  console.log('\n=== Charity venue names ===');
  charities.forEach(c => console.log(' DB:', c.id, JSON.stringify(c.name)));
  
  // Try fuzzy matching
  console.log('\n=== Fuzzy Matches ===');
  const matches = {};
  for (const vdtName of uniqueVdtNames) {
    const normVdt = normalize(vdtName);
    for (const c of charities) {
      const normDb = normalize(c.name);
      // Match if one contains the other (minimum 5 chars)
      if (normVdt.length >= 5 && normDb.length >= 5) {
        if (normVdt.includes(normDb) || normDb.includes(normVdt) ||
            normVdt.split(' ').some(w => w.length > 4 && normDb.includes(w))) {
          console.log(`  MATCH: VDT "${vdtName}" -> DB "${c.name}" (id=${c.id})`);
          matches[vdtName] = c.id;
        }
      }
    }
  }
  
  // Patch matches
  let patched = 0;
  for (const [vdtName, venueId] of Object.entries(matches)) {
    const { data: rows } = await sb.from('venue_daily_tournaments')
      .select('id').is('venue_id', null).eq('venue_name', vdtName);
    if (rows && rows.length > 0) {
      await sb.from('venue_daily_tournaments').update({ venue_id: venueId }).in('id', rows.map(r => r.id));
      console.log(`  Patched ${rows.length} rows for "${vdtName}" -> id=${venueId}`);
      patched += rows.length;
    }
  }
  console.log(`\nTotal patched: ${patched}`);
})();
