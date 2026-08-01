const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('secure_vault').select('*');
  console.log(error ? error : data);
}
run();
