require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_tables_rpc'); // if such an RPC exists
  // Alternatively, just try typical names
  const tables = ['tournaments', 'venue_tournaments', 'daily_tournaments', 'venue_tourney_schedules', 'event_schedules'];
  for (let table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (!error) {
          console.log(`Table exists: ${table}`);
      }
  }
}
run();
