import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const mlbDb = createClient(process.env.NEXT_PUBLIC_MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: fact } = await mlbDb.from('fact_games').select('official_date').order('official_date', { ascending: false }).limit(5);
  console.log("fact_games recent official_dates:", fact);

  const { data: agg } = await mlbDb.from('agg_market').select('as_of').order('as_of', { ascending: false }).limit(5);
  console.log("agg_market recent as_of:", agg);
}
check();
