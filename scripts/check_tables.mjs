import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('dim_teams').select('*').limit(1);
  console.log("dim_teams works.");
  // Let's use the REST API to get the OpenAPI schema directly from PostgREST to list tables
  const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.SUPABASE_SERVICE_ROLE_KEY);
  const swagger = await res.json();
  const tables = Object.keys(swagger.definitions || {}).filter(k => k.includes('game'));
  console.log('Tables with "game":', tables);
}
run();
