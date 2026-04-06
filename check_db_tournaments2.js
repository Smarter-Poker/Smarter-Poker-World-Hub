const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Querying Supabase for venue names with tournaments...");
  
  // Try venue_daily_tournaments
  const { data: q2, error: err2 } = await supabase
    .from('venue_daily_tournaments')
    .select('venue_id, venue_name')
    .limit(10000); // 10k just in case

  const vIds = new Set();
  const vNames = new Set();
  
  if (!err2 && q2) {
    q2.forEach(row => { 
      if (row.venue_id) vIds.add(row.venue_id); 
      if (row.venue_name) vNames.add(row.venue_name);
    });
    console.log(`Found ${q2.length} records in venue_daily_tournaments.`);
    console.log(`Unique venue_id count: ${vIds.size}`);
    console.log(`Unique venue_name count: ${vNames.size}`);
    if (vIds.size > 0) {
      console.log('IDs:', Array.from(vIds).sort((a,b)=>a-b).join(', '));
    }
    if (vNames.size > 0) {
      console.log('Names:', Array.from(vNames).sort().join(', '));
    }
  } else {
    console.log(`Error:`, err2);
  }
}

main();
