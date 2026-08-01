const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ;
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('venue_daily_tournaments')
    .update({ is_active: false, is_suppressed: true })
    .ilike('venue_name', '%Hammond%')
    .ilike('start_time', '%10:00%')
    .select('id, venue_name, tournament_name');
  
  if (error) console.error(error);
  console.log("Updated rows:", data);
}
run();
