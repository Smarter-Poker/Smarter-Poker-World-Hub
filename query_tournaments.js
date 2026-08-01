const { createClient } = require('@supabase/supabase-js');
const url = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
