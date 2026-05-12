require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('query_db', { query: "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user';" });
  console.log(data, error);
}
run();
