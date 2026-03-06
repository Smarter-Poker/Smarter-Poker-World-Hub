require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    const { data: users, error: e1 } = await supabase.from('toke_gigs').select('user_id').limit(1);
    console.log("Users:", users, e1);
}
test();
