const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: eCount, error: eErr } = await supabase.from('poker_events').select('*', { count: 'exact', head: true });
  if (eErr) console.error(eErr);
  else console.log(`Total events in DB: ${eCount}`);
  
  const { count: sCount, error: sErr } = await supabase.from('poker_series').select('*', { count: 'exact', head: true });
  if (sErr) console.error(sErr);
  else console.log(`Total series in DB: ${sCount}`);
}
check();
