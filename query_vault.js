const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';
const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'vault' } });

async function run() {
  const { data, error } = await supabase.from('decrypted_secrets').select('name, secret');
  console.log(error ? error : data);
}
run();
