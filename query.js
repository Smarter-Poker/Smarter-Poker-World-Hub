const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await db.from('pred_mlb_predictions')
    .select('market,selection,matchup,model_prob,best_price,edge_pts')
    .in('market', ['moneyline', 'h2h'])
    .limit(20);
  console.log(data);
}
run();
