import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data, error } = await supabase.from('clubs').select('id, name, club_id').ilike('name', '%shark%').limit(5);
    if(error) console.error(error);
    console.log("CLUBS FOUND:", data);
  } catch (e) {
    console.error("CATCH:", e);
  }
}
check();
