const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
(async () => {
  const { data, error } = await db.from('pred_best_bets').select('market').eq('market', 'stolen_bases').limit(1);
  console.log(data);
})();
