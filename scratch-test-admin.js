const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await supabase
        .from('live_help_tickets')
        .select(`
          id, subject, description, priority, status, created_at, user_id, conversation_id,
          profiles:user_id (display_name, username, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(2);
    console.log(JSON.stringify({ data, error }, null, 2));
}
run();
