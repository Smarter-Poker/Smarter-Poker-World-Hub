const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('fact_games').select('*').limit(1);
  if (error) console.log('fact_games error:', error);
  else console.log('fact_games fields:', Object.keys(data[0] || {}));
}
run();
