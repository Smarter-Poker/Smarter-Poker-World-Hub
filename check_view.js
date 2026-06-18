const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const mlbUrl = process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const mlbKey = process.env.MLB_SUPABASE_ANON_KEY;
const client = createClient(mlbUrl, mlbKey);

async function check() {
  const { data, error } = await client.from('v_team_profile').select('*').limit(1);
  console.log(error, data);
}
check();
