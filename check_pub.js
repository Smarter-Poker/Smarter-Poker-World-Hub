const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function check() {
  const { data, error } = await supabase.rpc('get_realtime_tables');
  if (error) {
     const { data: d2, error: e2 } = await supabase.from('raw_games').select('id').limit(1);
     console.log('raw_games accessible?', !!d2, e2);
  } else {
     console.log(data);
  }
}
check();
