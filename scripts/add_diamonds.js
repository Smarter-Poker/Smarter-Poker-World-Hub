const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) { console.error('No service key available in env'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
    const { data, error } = await supabase.from('profiles').select('id, email, diamonds').eq('email', 'daniel@bekavactrading.com').maybeSingle();
    if (error) {
        console.error(error);
    } else {
        console.log('Current diamonds:', data.diamonds);
        if (data.diamonds < 100) {
            await supabase.from('profiles').update({ diamonds: 1000 }).eq('id', data.id);
            console.log('Updated to 1000');
        }
    }
}
run();
