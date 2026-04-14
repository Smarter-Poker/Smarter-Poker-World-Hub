const { createClient } = require('@supabase/supabase-js');
const url = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';
const sb = createClient(url, key);

async function check() {
  const { data } = await sb.from('venue_daily_tournaments')
    .select('start_time, venue_name')
    .eq('is_active', true)
    .limit(20);
  console.log("Samples:", data);
}
check();
