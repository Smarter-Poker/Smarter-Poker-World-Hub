const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const urlMatches = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatches = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
  
  const dbUrl = urlMatches[1].replace(/['"]/g, '').trim();
  const dbKey = keyMatches[1].replace(/['"]/g, '').trim();
  
  const supabase = createClient(dbUrl, dbKey);
  
  const { data, error } = await supabase.from('clubs').select('id, name').eq('club_id', 25450);
  console.log("Found rows:", data?.length);
  if (data?.length > 1) console.log(data);
}
check();
