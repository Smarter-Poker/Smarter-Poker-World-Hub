import { createClient } from '@supabase/supabase-js';

const mlbDb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  const { data, error } = await mlbDb.from('v_pred_props').select('*').limit(1);
  console.log("Error:", error?.message);
  console.log("Data:", data);
}

main();
