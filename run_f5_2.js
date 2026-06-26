const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zY2RteGxkdHlzenl2Y3h4d2dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU2MTE5MywiZXhwIjoyMDk3MTM3MTkzfQ.fu9rj-XG3DvjUVO-SteDCnaEbZlS9uxCX5aIOdRMsOI'
  );
  
  const { data, error } = await sb.from('pred_market_output').select('market').ilike('market', '%team%').limit(10);
  console.log('pred_market_output markets:', Array.from(new Set(data.map(d => d.market))));
}
run();
