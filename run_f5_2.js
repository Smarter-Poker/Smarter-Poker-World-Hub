const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await sb.from('pred_market_output').select('market').ilike('market', '%team%').limit(10);
  console.log('pred_market_output markets:', Array.from(new Set(data.map(d => d.market))));
}
run();
