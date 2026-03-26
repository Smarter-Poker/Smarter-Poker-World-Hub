import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: favData, error: favErr } = await supabase.from('poker_near_me_favorites').select('*').limit(1);
  console.log('Favorites schema keys:', favData && favData[0] ? Object.keys(favData[0]) : 'Empty data', favErr || 'No error');
  
  const { data: searchData, error: searchErr } = await supabase.from('poker_near_me_search_history').select('*').limit(1);
  console.log('Search history schema keys:', searchData && searchData[0] ? Object.keys(searchData[0]) : 'Empty data', searchErr || 'No error');
}
check();
