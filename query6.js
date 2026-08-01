const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nscdmxldtyszyvcxxwgr.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function run() {
  const { data, error } = await db.from('pred_market_output')
    .select('*')
    .limit(1);
  console.log(data);
  if (error) console.error(error);
}
run();
