const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: charities } = await sb.from('poker_venues').select('id, name, website, city, state').eq('venue_type', 'charity').order('state');
  const charityIds = charities.map(c => c.id);
  
  const { data: vdtById } = await sb.from('venue_daily_tournaments').select('venue_id, venue_name, day_of_week').not('venue_id', 'is', null).in('venue_id', charityIds);
  const linkedIds = new Set((vdtById || []).map(r => r.venue_id));
  
  const { data: vdtByName } = await sb.from('venue_daily_tournaments').select('venue_name, day_of_week').is('venue_id', null);
  const linkedNames = new Set((vdtByName || []).map(r => (r.venue_name || '').toLowerCase()));
  
  console.log('=== CHARITY VENUE VDT COVERAGE ===');
  charities.forEach(c => {
    const hasById = linkedIds.has(c.id);
    const hasByName = linkedNames.has((c.name || '').toLowerCase());
    const status = hasById ? 'ID-LINKED OK' : hasByName ? 'NAME-LINKED OK' : 'MISSING !!';
    console.log(status, '|', c.id, '|', c.state, '|', c.name, '|', c.website || 'NO SITE');
  });
  
  const missing = charities.filter(c => !linkedIds.has(c.id) && !linkedNames.has((c.name || '').toLowerCase()));
  console.log('\nTotal charities:', charities.length);
  console.log('ID-linked venues:', linkedIds.size);
  console.log('MISSING from VDT entirely:', missing.length);
  missing.forEach(c => console.log('  MISSING:', c.id, c.name, '|', c.website));
})();
