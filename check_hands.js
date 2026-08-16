const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function check() {
  const { count, error } = await supabase.from('hand_history').select('*', { count: 'exact', head: true });
  console.log(`hand_history: ${error ? error.message : count}`);
}
check();
