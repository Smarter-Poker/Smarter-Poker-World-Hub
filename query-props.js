const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.vercel' });
const supabase = createClient(process.env.MLB_SUPABASE_URL || process.env.NEXT_PUBLIC_MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_MLB_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('pred_props').select('*').limit(1);
  console.log(data);
}
run();
