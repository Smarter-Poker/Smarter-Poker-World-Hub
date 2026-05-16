const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.production.local' });
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await supabase
        .from('live_help_tickets')
        .select('id, conversation_id')
        .eq('id', 'f4cbf915-92a6-4891-a42c-ad2548eda1ed');
    console.log(data);
}
run();
