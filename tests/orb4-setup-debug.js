require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const email = `debug_${Date.now()}@example.com`;
  console.log('Creating user:', email);
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
  if (authErr) return console.error('Auth Error:', authErr);
  const userId = authData.user.id;
  console.log('User ID:', userId);

  console.log('Inserting profile...');
  const { error: profErr } = await supabase.from('profiles').upsert({ id: userId, username: `dbg_${Date.now()}` });
  if (profErr) return console.error('Profile Error:', profErr);

  console.log('Inserting club...');
  const { data: clubData, error: clubErr } = await supabase.from('clubs').insert({
    owner_id: userId, name: `Debug Club`, club_id: '999999'
  }).select();
  
  if (clubErr) console.error('Club Error:', clubErr);
  else console.log('Club Data:', clubData);
}
test();
