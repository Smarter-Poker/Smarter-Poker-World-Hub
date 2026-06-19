require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mlbDb = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data, error } = await mlbDb.from('raw_games').select('*').limit(5);
  console.log("Error:", error);
  console.log("Data:", data);
}
check();
