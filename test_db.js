const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  let { data: p } = await supabase.from('pred_props').select('*').limit(1);
  console.log('pred_props:', Object.keys(p[0] || {}));
  let { data: a } = await supabase.from('agg_model').select('*').limit(1);
  console.log('agg_model:', Object.keys(a[0] || {}));
}
run();
