const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nscdmxldtyszyvcxxwgr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await db.from('pred_market_output')
    .select('market')
    .limit(100);
  if (data) {
    const markets = new Set(data.map(d => d.market));
    console.log(Array.from(markets));
  }
  if (error) console.error(error);
}
run();
