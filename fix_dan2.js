require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function fix() {
  const { data, error } = await supabase
    .from('profiles')
    .update({ created_at: '2025-10-20T00:00:00Z' })
    .eq('alias', '@KingFish');
  console.log('Fixed:', data, error);
}
fix();
