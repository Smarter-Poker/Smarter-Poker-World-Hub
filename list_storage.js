const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';
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
