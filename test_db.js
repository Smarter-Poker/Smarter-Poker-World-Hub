const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase.from('sandbox_sessions').select('*').limit(1);
  console.log(error ? error : Object.keys(data[0] || {}));
}
test();
