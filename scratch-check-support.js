const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
async function check() {
    const { data, error } = await supabase.from('profiles').select('id, username, email').or('email.ilike.%support%,username.ilike.%support%');
    console.log(data, error);
}
check();
