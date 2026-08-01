const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://kuklfnapbkmacvwxktbh.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getStats() {
  const { data: allActive } = await sb.from('poker_venues').select('id, name, venue_type, has_tournaments').eq('is_active', true);
  
  const skipTypes = ['tour', 'series', 'event', 'home game', 'charity'];
  const targetVenues = allActive.filter(v => v.venue_type && !skipTypes.some(t => v.venue_type.toLowerCase().includes(t)));
  const totalTarget = targetVenues.length;
  
  let allRecords = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('venue_daily_tournaments').select('venue_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    allRecords = allRecords.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  
  const distinctVenueIdsWithData = new Set(allRecords.map(r => r.venue_id));
  
  let validWithData = 0;
  let validMissing = [];
  
  for (const v of targetVenues) {
    if (distinctVenueIdsWithData.has(v.id)) {
      validWithData++;
    } else {
      validMissing.push(v);
    }
  }
  
  console.log('--- STRICT CARD ROOM TOURNAMENT COVERAGE ---');
  console.log('Total Active Venues in DB:', allActive.length);
  console.log('Target Card Rooms (Excluding Charity/Series/Tours):', totalTarget);
  console.log('Target Venues WITH successfully captured tournaments:', validWithData);
  console.log('Target Venues MISSING tournament data:', validMissing.length);
  console.log('True Coverage % of Target Base:', ((validWithData / totalTarget) * 100).toFixed(2) + '%');
  
  const expectedNoTournaments = validMissing.filter(v => v.has_tournaments === false).length;
  console.log('\n--- Missing Data Analysis ---');
  console.log('Of the ' + validMissing.length + ' missing valid venues:');
  console.log('- ' + expectedNoTournaments + ' have has_tournaments=false (Expected zero data, strictly Cash Game rooms)');
  console.log('- ' + (validMissing.length - expectedNoTournaments) + ' remaining venues genuinely need coverage / waiting for scraper to find them');
  
  // Show a few examples of missing venues to give the user context
  const unknownMissing = validMissing.filter(v => v.has_tournaments !== false);
  console.log('\nSample of genuinely missing venues that still need resolution:');
  const sample = unknownMissing.slice(0, 10).map(v => v.name).join(', ');
  console.log(sample);
}
getStats().catch(e => console.error(e));
