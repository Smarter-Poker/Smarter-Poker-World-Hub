const { createClient } = require('@supabase/supabase-js');

const mlbUrl = process.env.SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const mlbKey = process.env.SUPABASE_SERVICE_KEY;

if (!mlbKey) {
  console.error('No service key provided');
  process.exit(1);
}

const mlbDb = createClient(mlbUrl, mlbKey);

async function checkAggTeam() {
  const { data, error } = await mlbDb.from('agg_team').select('*').limit(5);
  if (error) {
    console.error('Error fetching agg_team:', error);
  } else {
    console.log('agg_team data:', JSON.stringify(data, null, 2));
  }
}

checkAggTeam();
