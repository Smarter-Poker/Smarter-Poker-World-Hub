const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check tour_event_details table
  const { data: det, error: e1 } = await sb.from('tour_event_details').select('tour_code');
  console.log('tour_event_details:', e1 ? 'ERROR: ' + e1.message : det.length + ' rows');

  // Check tour_events table
  const { data: ev, error: e2 } = await sb.from('tour_events').select('tour_code');
  console.log('tour_events:', e2 ? 'ERROR: ' + e2.message : ev.length + ' rows');

  // Breakdown by tour (tour_event_details)
  if (!e1 && det) {
    const grouped = {};
    det.forEach(r => { grouped[r.tour_code] = (grouped[r.tour_code] || 0) + 1; });
    console.log('\nBreakdown (tour_event_details):');
    Object.entries(grouped).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ': ' + v + ' events'));
  }

  // Breakdown by tour (tour_events)
  if (!e2 && ev) {
    const grouped2 = {};
    ev.forEach(r => { grouped2[r.tour_code] = (grouped2[r.tour_code] || 0) + 1; });
    console.log('\nBreakdown (tour_events):');
    Object.entries(grouped2).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ': ' + v + ' events'));
  }
}

main().catch(console.error);
