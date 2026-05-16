const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data } = await supabase.from('social_pages').select('id, name, avatar_url').or('name.ilike.%Midway%,name.ilike.%Shark%');
    console.log(JSON.stringify(data, null, 2));
})();
