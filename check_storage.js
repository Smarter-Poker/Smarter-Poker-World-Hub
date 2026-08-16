const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.rpc('get_size_by_bucket');
  if (error) console.error("No RPC get_size_by_bucket");

  const { count, error: err2 } = await supabase.storage.from('avatars').list();
  console.log('avatars:', err2 ? err2 : count ? count.length : 'ok');
}
check();
