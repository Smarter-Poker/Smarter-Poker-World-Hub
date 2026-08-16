const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  'sb_secret_uGZwWqb3X46MB5ZQsaMCZg_DZsij23w'
);

async function run() {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('List error:', listError);
    return;
  }
  const user = users.users.find(u => u.email === 'daniel@bekavactrading.com');
  if (!user) {
    console.error('User not found');
    return;
  }
  
  const newPassword = 'SecurePassword2026!';
  const { data, error } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword }
  );
  
  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('Successfully changed password for', user.email);
  }
}
run();
