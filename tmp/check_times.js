const { createClient } = require('@supabase/supabase-js');
const url = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

async function check() {
  const { data } = await sb.from('venue_daily_tournaments')
    .select('start_time, venue_name')
    .eq('is_active', true)
    .limit(20);
  console.log("Samples:", data);
}
check();
