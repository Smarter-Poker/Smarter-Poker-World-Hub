require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    const { data: authData } = await supabase.auth.signInWithPassword({
        email: 'daniel@bekavactrading.com',
        password: 'Bek454545!!'
    });

    const { data, error } = await supabase
        .from('content_settings')
        .upsert({ id: 1, engine_enabled: false })
        .select();

    console.log(error ? 'Error: ' + error.message : 'Upsert success: ' + JSON.stringify(data));
}
check();
