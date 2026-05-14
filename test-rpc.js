const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name').ilike('full_name', '%test%').limit(5);
  console.log("Found profiles:", profiles);
  if (profiles.length) {
    const { data, error } = await supabaseAdmin.rpc('get_commander_access_details', { p_user_id: profiles[0].id });
    console.log("Access details:", data, error);
  }
}
run();
