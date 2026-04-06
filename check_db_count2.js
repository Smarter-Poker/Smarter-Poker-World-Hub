const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { count, error } = await supabase.from('venue_daily_tournaments').select('*', { count: 'exact', head: true });
  console.log('Total count in venue_daily_tournaments:', count);
  
  const size = 1000;
  let allNames = new Set();
  
  for(let i = 0; i < 50; i++) {
    const { data } = await supabase.from('venue_daily_tournaments').select('venue_name').range(i*size, (i+1)*size-1);
    if (!data || data.length === 0) break;
    data.forEach(r => allNames.add(r.venue_name));
  }
  console.log(`Total unique names: ${allNames.size}`);
  console.log('Names:', Array.from(allNames).sort().join(', '));
}
run().catch(console.error);
