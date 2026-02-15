require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    // Get social_pages columns
    const { data: sp } = await supabase.from('social_pages').select('*').limit(1);
    console.log('social_pages columns:', sp ? Object.keys(sp[0] || {}) : 'empty table');
    console.log('social_pages sample:', sp);

    // Get social_page_followers columns
    const { data: spf } = await supabase.from('social_page_followers').select('*').limit(1);
    console.log('social_page_followers columns:', spf ? Object.keys(spf[0] || {}) : 'empty table');
}
run();
