const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await sb.from('pred_best_bets').select('*').ilike('market', '%f5%team%').limit(5);
  const { data: d2, error: e2 } = await sb.from('pred_best_bets').select('*').ilike('market', '%first_5%team%').limit(5);
  console.log('f5:', data);
  console.log('first_5:', d2);
}
run();
