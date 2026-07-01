const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
(async () => {
  const { data, error } = await db.from('pred_props').select('as_of_ts, prop, best_price, best_price_under').order('as_of_ts', { ascending: false }).limit(5);
  console.log(data);
  const count = await db.from('pred_props').select('*', { count: 'exact', head: true });
  console.log('Total count:', count);
})();
