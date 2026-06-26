require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', 
  process.env.MLB_SUPABASE_SERVICE_KEY
);
async function run() {
  const { data, error } = await supabase.from('pred_market_output')
    .select('as_of_ts, market, selection')
    .eq('game_pk', 823363)
    .in('market', ['h2h', 'run_line', 'total'])
    .order('as_of_ts', { ascending: false })
    .limit(10);
  console.log(data);
}
run();
