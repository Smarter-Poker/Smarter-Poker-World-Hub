const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ;
const supabase = createClient(url, key);
const fs = require('fs');

async function run() {
  const { data, error } = await supabase
    .from('venue_daily_tournaments')
    .select('id, venue_name, day_of_week, start_time, game_type, buy_in, tournament_name, source_url, data_quality')
    .ilike('venue_name', '%Hammond%')
    .eq('is_active', true)
    
  fs.writeFileSync('scripts/results.json', JSON.stringify(data, null, 2));
}
run();
