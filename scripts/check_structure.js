require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tourneys, error } = await supabase.from('tournaments').select('*').limit(3);
  console.log('Sample tournament:', tourneys?.[0]);
  
  // also what about 'venue_game_schedules'?
  const { data: scheds, error: err2 } = await supabase.from('venue_game_schedules').select('*').limit(3);
  console.log('Sample venue schedule:', scheds?.[0]);
}

run();
