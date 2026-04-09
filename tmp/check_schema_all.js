const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('poker_events').select('*').limit(1);
  if (error) console.log("poker_events ERROR:", error);
  else console.log("poker_events:", data);
  
  const { data: sData, error: sErr } = await supabase.from('poker_series').select('*').limit(1);
  if (sErr) console.log("poker_series ERROR:", sErr);
  else console.log("poker_series:", sData);
  
  const { data: tData, error: tErr } = await supabase.from('tournaments').select('*').limit(1);
  if (tErr) console.log("tournaments ERROR:", tErr);
  else console.log("tournaments:", tData);
}
check();
