const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'sb_secret_-JMU3PyMvxxkGYzKLTzrbQ_OZPZQuYW');
async function run() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) console.error(error);
  else console.log(data.users[0]);
}
run();
