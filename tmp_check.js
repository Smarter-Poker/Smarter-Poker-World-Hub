const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const urlMatches = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatches = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

  const dbUrl = urlMatches[1].replace(/['"]/g, '').trim();
  const dbKey = keyMatches[1].replace(/['"]/g, '').trim();

  const supabase = createClient(dbUrl, dbKey);

  console.log("Querying Supabase...");
  const { data, error } = await supabase.from('clubs').select('id, name, club_id').ilike('name', '%shark%').limit(5);
  if (error) {
    console.error("DB Error:", error);
  } else {
    console.log("Found:", JSON.stringify(data, null, 2));
  }
}

check();
