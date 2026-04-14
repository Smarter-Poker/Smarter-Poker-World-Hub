const { createClient } = require('@supabase/supabase-js');
const url = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('venue_daily_tournaments')
    .select('*')
    .ilike('venue_name', '%Horseshoe%')
    .ilike('venue_name', '%Hammond%');
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
