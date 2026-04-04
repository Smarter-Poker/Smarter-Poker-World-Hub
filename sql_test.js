const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.agent/skills/credentials/.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('poker_venues').select('venue_type');
  if (error) { console.error(error); return; }
  const counts = {};
  data.forEach(d => {
    counts[d.venue_type] = (counts[d.venue_type] || 0) + 1;
  });
  console.log("Types:", counts);
}
run();
