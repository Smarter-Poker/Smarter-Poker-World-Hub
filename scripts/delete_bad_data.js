const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('venue_daily_tournaments')
    .update({ is_active: false, is_suppressed: true })
    .ilike('venue_name', '%Hammond%')
    .ilike('tournament_name', '%omaha%')
    .eq('buy_in', 400)
    .select('id, venue_name, tournament_name');
  
  if (error) console.error(error);
  console.log("Updated rows:", data);
}
run();
