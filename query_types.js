require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('poker_venues').select('venue_type').neq('is_active', false);
  if (error) { console.error(error); return; }
  const types = new Set(data.map(d => d.venue_type));
  console.log("poker_venues types:", [...types]);
  
  const { data: sp, error: err2 } = await supabase.from('social_pages').select('page_type').neq('is_public', false);
  if (err2) { console.error(err2); return; }
  const spTypes = new Set(sp.map(d => d.page_type));
  console.log("social_pages types:", [...spTypes]);
}
run();
