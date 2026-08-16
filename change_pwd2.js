const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  'sb_secret_uGZwWqb3X46MB5ZQsaMCZg_DZsij23w',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('List error:', error);
    return;
  }
  const user = data.users.find(u => u.email === 'daniel@bekavactrading.com');
  if (!user) {
    console.error('User not found');
    return;
  }
  
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: 'SecurePassword2026!' }
  );
  if (updateError) {
    console.error('Update error:', updateError);
  } else {
    console.log('Successfully changed password for daniel@bekavactrading.com');
  }
}
run();
