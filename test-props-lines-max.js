import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await mlbDb.from('pred_props').select('best_lines').limit(50);
  let maxLines = 0;
  let sample = null;
  for (const row of data || []) {
    if (row.best_lines && row.best_lines.length > maxLines) {
      maxLines = row.best_lines.length;
      sample = row.best_lines;
    }
  }
  console.log(`Max lines found: ${maxLines}`);
  console.log(sample);
}
run();
