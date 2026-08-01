const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await sb.from('pred_market_output').select('selection, market').or('selection.ilike.%home%,selection.ilike.%away%').gte('as_of_ts', '2026-06-25T00:00:00Z').limit(20);
  console.log('home/away selections:', data);
}
run();
