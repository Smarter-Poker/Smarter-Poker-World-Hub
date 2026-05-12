require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Starting display_name cleanup...");
  
  // 1. Fetch profiles that need fixing (where display_name differs from full_name AND full_name is set)
  const { data: nameData, error: nameError } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email')
    .neq('full_name', '')
    .not('full_name', 'is', null);
    
  if (nameError) {
    console.error("Error fetching full_name profiles:", nameError);
    return;
  }
  
  let fixed = 0;
  for (const p of nameData) {
    if (p.full_name && p.display_name !== p.full_name) {
      console.log(`Fixing ID ${p.id}: ${p.display_name} -> ${p.full_name}`);
      await supabase.from('profiles').update({ display_name: p.full_name }).eq('id', p.id);
      fixed++;
    }
  }
  
  // 2. Fetch profiles with username but NO full_name, where display_name differs
  const { data: userData, error: userError } = await supabase
    .from('profiles')
    .select('id, username, display_name, full_name')
    .or('full_name.is.null,full_name.eq.""')
    .neq('username', '')
    .not('username', 'is', null);
    
  if (userError) {
    console.error("Error fetching username profiles:", userError);
    return;
  }
  
  for (const p of userData) {
    if (p.username && p.display_name !== p.username) {
      console.log(`Fixing ID ${p.id} (no full_name): ${p.display_name} -> ${p.username}`);
      await supabase.from('profiles').update({ display_name: p.username }).eq('id', p.id);
      fixed++;
    }
  }

  console.log(`Done! Fixed ${fixed} profiles.`);
}

run();
