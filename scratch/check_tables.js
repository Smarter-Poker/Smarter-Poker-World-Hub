require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('fact_games').select('game_pk').limit(1);
  console.log('fact_games:', error ? error.message : 'exists');
  const { data: d2, error: e2 } = await supabase.from('fct_games').select('game_pk').limit(1);
  console.log('fct_games:', e2 ? e2.message : 'exists');
  const { data: d3, error: e3 } = await supabase.from('raw_games').select('game_pk').limit(1);
  console.log('raw_games:', e3 ? e3.message : 'exists');
}
run();
