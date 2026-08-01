const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nscdmxldtyszyvcxxwgr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await db.from('pred_mlb_predictions')
    .select('market,selection,matchup,model_prob,best_price,edge_pts')
    .eq('official_date', '2026-06-25')
    .in('market', ['moneyline', 'h2h'])
    .order('model_prob', { ascending: false })
    .limit(10);
  console.log(data);
  if (error) console.error(error);
}
run();
