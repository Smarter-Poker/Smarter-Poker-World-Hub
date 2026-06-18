import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
  const { data, error } = await supabase.rpc('get_tables'); // Or try to query pg_catalog
  if (error) {
    // If no rpc, let's query a known table and try to get the error if it fails
    console.log("Error:", error);
  }
}
run();
