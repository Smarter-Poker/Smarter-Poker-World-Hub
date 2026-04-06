require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    let { data, error } = await supabase.from('tour_source_registry').delete().eq('tour_code', 'CARD_PLAYER_CRUISES');
    console.log('Deleted tour_source_registry result:', data, error);
}
run();
