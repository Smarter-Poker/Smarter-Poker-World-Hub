const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Try direct profile update by username
    const { data, error } = await sb.from('profiles')
        .update({ diamonds: 1000 })
        .ilike('username', '%daniel%')
        .select('id, username, diamonds');
    if (error) console.log('Error:', error.message);
    else if (data && data.length > 0) console.log('Updated:', JSON.stringify(data));
    else {
        // Fallback: get all profiles to find the right one
        const { data: allProfiles } = await sb.from('profiles').select('id, username, email, diamonds').limit(10);
        console.log('Available profiles:', JSON.stringify(allProfiles, null, 2));
    }
    process.exit(0);
})();
