import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAuthSQL() {
  const email = 'bhenricks21@gmail.com';
  
  console.log(`Checking identities and users for ${email}...`);
  
  // Create an RPC function to check auth if needed, or just let the user know what's happening
  // For safety, let's just use the profile mapping for now
  
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, username, created_at, last_login')
    .ilike('email', `%${email}%`);
    
  if (profileError) {
    console.error('Error fetching profiles:', profileError);
  } else {
    console.log(`Found ${profiles.length} profiles matching ${email}:`);
    profiles.forEach(p => console.log(JSON.stringify(p, null, 2)));
    
    if (profiles.length === 1) {
      console.log("\nThere is only ONE profile for this precise email address.");
      
      // Let's check for similar emails (e.g. typos)
      const username = email.split('@')[0];
      const { data: similarProfiles } = await supabase
        .from('profiles')
        .select('id, email, username, created_at, last_login')
        .ilike('email', `${username}%`);
        
      console.log(`\nFound ${similarProfiles?.length || 0} profiles with emails starting with '${username}':`);
      similarProfiles?.forEach(p => console.log(`- ID: ${p.id}, Email: ${p.email}, Alias: ${p.username}`));
    }
  }
}

checkAuthSQL();
