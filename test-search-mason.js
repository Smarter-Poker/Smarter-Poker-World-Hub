require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, display_name, username')
    .or('username.ilike.%mason%,full_name.ilike.%mason%,display_name.ilike.%mason%');
  console.log("Mason Search Results:", data);
}
run();
