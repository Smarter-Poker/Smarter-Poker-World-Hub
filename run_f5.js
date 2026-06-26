const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zY2RteGxkdHlzenl2Y3h4d2dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU2MTE5MywiZXhwIjoyMDk3MTM3MTkzfQ.fu9rj-XG3DvjUVO-SteDCnaEbZlS9uxCX5aIOdRMsOI'
  );
  
  const { data, error } = await sb.from('pred_best_bets').select('*').ilike('market', '%f5%team%').limit(5);
  const { data: d2, error: e2 } = await sb.from('pred_best_bets').select('*').ilike('market', '%first_5%team%').limit(5);
  console.log('f5:', data);
  console.log('first_5:', d2);
}
run();
