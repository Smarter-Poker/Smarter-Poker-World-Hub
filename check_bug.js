const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);
async function run() {
  const { data, error } = await sb.from('tour_stop_events').select('id').eq('is_active', true).limit(1);
  console.log("Error:", error?.message);
}
require('dotenv').config({path: '.env.local'});
run();
