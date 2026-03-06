const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const urlMatches = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  
  // Use SERVICE ROLE KEY to query internal policies
  const keyMatches = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  if (!keyMatches) {
    console.log("No service role key found, checking pg_policies might fail via anon");
  }
  
  const dbUrl = urlMatches[1].replace(/['"]/g, '').trim();
  const dbKey = keyMatches ? keyMatches[1].replace(/['"]/g, '').trim() : envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].replace(/['"]/g, '').trim();
  
  const supabase = createClient(dbUrl, dbKey);
  
  const { data, error } = await supabase.from('pg_policies').select('*').eq('tablename', 'clubs');
  if (error) {
     console.error("DB Error:", error.message);
  } else {
     console.log("Policies:", JSON.stringify(data, null, 2));
  }
}

check();
