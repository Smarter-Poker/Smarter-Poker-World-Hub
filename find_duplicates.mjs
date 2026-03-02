import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDuplicates() {
  const email = 'bhenricks21@gmail.com';
  
  // 1. Check auth.users (can only be done with admin API or direct query if permissions allow)
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error('Error fetching auth users:', authError);
  } else {
    // Exact or case-insensitive match depending on how Supabase handles it internally,
    // safe bet is to check lowercase
    const matchingAuth = authUsers.users.filter(u => u.email?.toLowerCase() === email.toLowerCase());
    console.log(`\nFound ${matchingAuth.length} master Auth accounts for ${email}:`);
    matchingAuth.forEach(u => console.log(`- ID: ${u.id}, Created: ${u.created_at}, Provider: ${u.app_metadata?.provider}, Identity data: ${JSON.stringify(u.identities)}`));
  }

  // 2. Check profiles
  console.log(`\nSearching profiles for ${email}...`);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', `%${email}%`);
    
  if (profileError) {
    console.error('Error fetching profiles:', profileError);
  } else {
    console.log(`Found ${profiles.length} profiles:`);
    profiles.forEach(p => console.log(`- ID: ${p.id}, Player #: ${p.player_number}, Email: ${p.email}, VIP: ${p.is_vip}`));
  }
}

checkDuplicates();
