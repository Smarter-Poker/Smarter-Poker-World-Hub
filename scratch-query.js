const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function check() {
    const { data: user, error: e1 } = await supabase.from('profiles').select('id, username').ilike('username', 'support');
    console.log('Profile:', user, e1);
    const { data: users, error: e2 } = await supabase.auth.admin.listUsers();
    const match = users?.users?.find(u => u.email === 'support@smarter.poker');
    console.log('Auth Match:', match ? match.email : 'NOT FOUND');
}
check();
