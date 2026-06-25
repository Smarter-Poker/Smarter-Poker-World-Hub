const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_best_bets_stats', {
    p_limit: 1000,
  });
  if (error) {
    console.log("RPC Error:", error.message);
  } else {
    console.log("Bets count:", data.bets.length);
    const markets = {};
    data.bets.forEach(b => {
      markets[b.market] = (markets[b.market] || 0) + 1;
    });
    console.log("Markets:", markets);
  }
}
run();
