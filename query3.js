const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nscdmxldtyszyvcxxwgr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zY2RteGxkdHlzenl2Y3h4d2dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU2MTE5MywiZXhwIjoyMDk3MTM3MTkzfQ.fu9rj-XG3DvjUVO-SteDCnaEbZlS9uxCX5aIOdRMsOI'
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
