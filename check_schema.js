const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);
async function run() {
  const { data } = await sb.from('tour_stop_events').select('*').limit(1);
  console.log(data ? Object.keys(data[0] || {}) : "No data");
}
require('dotenv').config({path: '.env.local'});
run();
