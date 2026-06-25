const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
);
async function run() {
  const { data, error } = await db.from('pred_mlb_predictions')
    .select('market,selection,matchup,model_prob,best_price,edge_pts')
    .in('market', ['moneyline', 'h2h'])
    .limit(20);
  console.log(data);
}
run();
