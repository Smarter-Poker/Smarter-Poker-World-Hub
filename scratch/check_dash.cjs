require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);

async function run() {
  const { data: fact } = await mlbDb.from('fact_games').select('official_date, game_pk').eq('official_date', '2026-06-19');
  console.log("fact_games for 2026-06-19:", fact?.length);

  const { data: daily } = await mlbDb.from('v_daily_slate').select('official_date, game_pk').eq('official_date', '2026-06-19');
  console.log("v_daily_slate for 2026-06-19:", daily?.length);
}
run();
