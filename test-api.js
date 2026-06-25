require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mlbDb = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data } = await mlbDb.from('pred_mlb_predictions').select('market, count(*)').eq('official_date', '2026-06-25').groupBy('market');
  console.log(data);
}
check();
