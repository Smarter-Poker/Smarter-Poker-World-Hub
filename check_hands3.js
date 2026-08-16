const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function check() {
  const { count, error } = await supabase.from('hand_history').select('*', { count: 'estimated', head: true });
  console.log('hand_history estimated count:', count, error ? error : '');
  
  // also check other large tables if possible
  const { count: c2 } = await supabase.from('action_logs').select('*', { count: 'estimated', head: true });
  console.log('action_logs estimated count:', c2);
}
check();
