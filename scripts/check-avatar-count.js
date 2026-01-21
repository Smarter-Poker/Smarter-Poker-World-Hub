// Check how many horses actually have avatars in the database
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

async function check() {
    const { data, error } = await supabase
        .from('content_authors')
        .select('id, name, avatar_url, is_active')
        .eq('is_active', true)
        .order('id');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    const withAvatar = data.filter(h => h.avatar_url);
    const withoutAvatar = data.filter(h => !h.avatar_url);

    console.log('Total active:', data.length);
    console.log('With avatar:', withAvatar.length);
    console.log('Without avatar:', withoutAvatar.length);

    console.log('\nFirst 10 horses showing avatar status:');
    data.slice(0, 10).forEach(h => {
        console.log(`  ${h.id}: ${h.name} - ${h.avatar_url ? '✅ HAS AVATAR' : '❌ NO AVATAR'}`);
    });
}

check();
