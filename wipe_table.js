import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const wipe = async () => {
  await supabase.from('commander_tables').delete().eq('table_number', 99);
  console.log('Table 99 Wiped');
  process.exit(0);
};
wipe();
