const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: venues, error } = await supabase
    .from('poker_venues')
    .select('id, name, venue_type, has_tournaments');
  
  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${venues.length} venues.`);
  
  // count how many have tournaments
  const stats = {
    total: venues.length,
    hasTournamentsTrue: venues.filter(v => v.has_tournaments).length,
    hasTournamentsFalse: venues.filter(v => !v.has_tournaments).length,
  };
  console.log(stats);
  
  // sample some missing ones
  const missing = venues.filter(v => !v.has_tournaments);
  if (missing.length > 0) {
     console.log("Sample missing:");
     console.log(missing.slice(0, 10));
  }
}
run();
