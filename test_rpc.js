require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('get_best_bets_stats', { target_date: '2026-06-26' });
  console.log("Bets count:", data?.bets?.length);
  if (data?.bets?.length) {
    console.log("First bet keys:", Object.keys(data.bets[0]));
    console.log("Has FIP?", data.bets[0].hasOwnProperty('fip'));
    console.log("Has wOBA?", data.bets[0].hasOwnProperty('woba'));
  }
}
run();
