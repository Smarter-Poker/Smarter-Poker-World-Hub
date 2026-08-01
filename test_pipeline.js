const { createClient } = require('@supabase/supabase-js');
const mlbDb = createClient('https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await mlbDb.from('pipeline_runs').select('*').order('run_ts', { ascending: false }).limit(5);
  console.log('Recent pipeline runs:', data);
}
run();
