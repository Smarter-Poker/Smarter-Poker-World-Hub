const { createClient } = require('@supabase/supabase-js');

async function run() {
  const sb = createClient(
    'https://nscdmxldtyszyvcxxwgr.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  // A query that intentionally fails to see the tables
  const { data, error } = await sb.from('does_not_exist').select('*').limit(1);
  console.log(error);
}
run();
