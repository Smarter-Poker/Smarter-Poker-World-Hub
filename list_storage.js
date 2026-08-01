const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) { console.error('Buckets error:', error); return; }
  console.log('Buckets:', buckets.map(b => b.name));
  
  for (const b of buckets) {
    const { data: objects } = await supabase.storage.from(b.name).list();
    if (objects) console.log(`Objects in ${b.name}:`, objects.map(o => o.name));
  }
}
run();
