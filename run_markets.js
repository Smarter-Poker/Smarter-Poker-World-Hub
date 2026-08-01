const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await sb.from('pred_props').select('market').gte('as_of_ts', '2026-06-25T00:00:00Z');
  console.log('error:', error);
  if (data) {
     console.log('pred_props markets:', Array.from(new Set(data.map(d => d.market))));
  }
}
run();
