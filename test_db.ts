import { getMlbSupabase } from './utils/supabase/mlb';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const mlbDb = getMlbSupabase();
  const { data, error } = await mlbDb.from('pred_mlb_predictions').select('*').limit(1);
  if (error) console.log(error);
  else console.log(Object.keys(data[0] || {}));
}
run();
