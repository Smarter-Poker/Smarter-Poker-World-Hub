const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'vault' } });

async function run() {
  const { data, error } = await supabase.from('decrypted_secrets').select('name, secret');
  console.log(error ? error : data);
}
run();
