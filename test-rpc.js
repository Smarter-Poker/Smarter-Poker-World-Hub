const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf-8');
const getEnv = (key) => {
    const match = envContent.match(new RegExp(`^${key}=['"]?(.*?)['"]?$`, 'm'));
    return match ? match[1] : null;
};
const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supabase = createClient(url, key, { auth: { persistSession: false } });
(async () => {
  const { data, error } = await supabase.rpc('bump_challenge_progress', { 
    p_user_id: '00000000-0000-0000-0000-000000000000', 
    p_amounts: { hands_played: 1 }, 
    p_daily_key: '1970-01-01', 
    p_weekly_key: 'W1970-01-01', 
    p_monthly_key: 'M1970-01' 
  });
  console.log('Error:', error);
  console.log('Data:', data);
  process.exit(0);
})();
