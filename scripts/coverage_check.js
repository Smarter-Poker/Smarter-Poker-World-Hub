const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://kuklfnapbkmacvwxktbh.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getStats() {
  const { count: totalActive } = await sb.from('poker_venues').select('*', { count: 'exact', head: true }).eq('is_active', true);
  
  let allRecords = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('venue_daily_tournaments')
      .select('venue_id, day_of_week, event_date')
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allRecords = allRecords.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  
  const uniqueVenues = new Set(allRecords.map(r => r.venue_id));
  const venuesCovered = uniqueVenues.size;
  const venuesMissing = totalActive - venuesCovered;
  
  const daily = allRecords.filter(r => r.day_of_week && r.day_of_week.toLowerCase().includes('daily')).length;
  const weeklyDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const weekly = allRecords.filter(r => r.day_of_week && weeklyDays.some(d => r.day_of_week.toLowerCase().includes(d))).length;
  // Events that have an explicit date OR are not strictly daily/weekly (often they appear as "Every other Sunday", etc. but let's count strictly dated ones)
  const datedEvents = allRecords.filter(r => r.event_date).length;
  
  // What about monthly? Some might just be monthly keywords
  const monthly = allRecords.filter(r => r.day_of_week && r.day_of_week.toLowerCase().includes('month')).length;

  const totalTourneys = allRecords.length || 1;

  console.log('--- TOURNAMENT DATA COVERAGE BREAKDOWN ---');
  console.log('Total targeted (Active) venues:', totalActive);
  console.log('Venues WITH tournament data:', venuesCovered);
  console.log('Venues MISSING tournament data:', venuesMissing);
  console.log('Venue Coverage %:', ((venuesCovered / totalActive) * 100).toFixed(2) + '%');
  
  console.log('\n--- TOURNAMENT FREQUENCY BREAKDOWN ---');
  console.log('Total recorded tournaments:', allRecords.length);
  console.log('Daily: ' + daily + ' (' + ((daily / totalTourneys) * 100).toFixed(2) + '%)');
  console.log('Weekly (Specific Days): ' + weekly + ' (' + ((weekly / totalTourneys) * 100).toFixed(2) + '%)');
  console.log('Monthly (Specials): ' + monthly + ' (' + ((monthly / totalTourneys) * 100).toFixed(2) + '%)');
  console.log('Dated Specific Events/Series: ' + datedEvents + ' (' + ((datedEvents / totalTourneys) * 100).toFixed(2) + '%)');
}
getStats().catch(e => console.error(e));
