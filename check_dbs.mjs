import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const userId = 'af9aa869-f19d-47e0-89be-461473924d3e';

async function check() {
  const { data: staff } = await supabase.from('commander_staff').select('*').eq('user_id', userId);
  const { data: subs } = await supabase.from('commander_subscriptions').select('*, venue:poker_venues(id, name)').eq('owner_id', userId);
  
  console.log('Staff records:', staff?.length);
  staff?.forEach(s => console.log(JSON.stringify(s)));
  
  console.log('\nSubscriptions:', subs?.length);
  subs?.forEach(s => console.log(JSON.stringify(s)));
}
check();
