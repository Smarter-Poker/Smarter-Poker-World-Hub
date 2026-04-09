require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const fileBuffer = fs.readFileSync('tmp/rr.png');
  const res = await supabase.storage.from('venue-logos').upload('3116.png', fileBuffer, { contentType: 'image/png', upsert: true });
  console.log(res);
}
run();
