const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const email = 'daniel@bekavactrading.com';
  const password = 'Bek454545!!';
  
  // 1. Sign in to get user ID
  const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (authErr || !authData.user) {
    console.error('Error logging in:', authErr);
    return;
  }
  
  const userId = authData.user.id;
  console.log(`Successfully authenticated user ID: ${userId}`);
  
  // 2. Update profile to remove mfa_required
  const { data, error } = await supabase
    .from('profiles')
    .update({ mfa_required: false })
    .eq('id', userId)
    .select();
    
  if (error) {
    console.error('Error updating profile:', error);
  } else {
    console.log('Successfully updated profile:', data);
  }
}
run();
