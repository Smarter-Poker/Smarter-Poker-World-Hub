require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: fact, error: err1 } = await mlbDb.from('fact_games').select('official_date, game_pk').order('official_date', { ascending: false }).limit(5);
  console.log("fact_games err:", err1);

  const { data: agg, error: err2 } = await mlbDb.from('agg_market').select('as_of').order('as_of', { ascending: false }).limit(5);
  console.log("agg_market err:", err2);
}
run();
