require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env', override: false });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: pt, error: e1 } = await supabase.from('poker_tours').select('*');
    const { data: pts, error: e2 } = await supabase.from('poker_tour_series').select('*');
    if (e1) console.error("e1:", e1);
    if (e2) console.error("e2:", e2);

    const { data: vts, error: e3 } = await supabase.from('venue_tournaments').select('*').not('tour_code', 'is', null).limit(10);
    if (e3) console.error("e3:", e3);
    
    console.log(`Tours: ${pt?.length || 0}, Series: ${pts?.length || 0}, Tournaments: ${vts?.length || 0}`);
}
check();
