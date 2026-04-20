require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: v } = await sb.from('poker_venues').select('name, bravo_slug, slug, latitude, longitude').ilike('name', '%Horseshoe%Hammond%');
    console.log("Hammond:", v);

    const { data: v2 } = await sb.from('poker_venues').select('name, bravo_slug, slug, latitude, longitude').ilike('name', '%Rivers%Casino%');
    console.log("Rivers:", v2);

    const { data: v3 } = await sb.from('poker_venues').select('name, bravo_slug, slug, latitude, longitude').ilike('name', '%Grand%Victoria%');
    console.log("Victoria:", v3);

    const { data: live } = await sb.from('venue_live_tables').select('venue_name, bravo_slug');
    console.log("Live sample:", live.slice(0, 3));
    console.log(live.filter(x => x.venue_name.includes('Rivers') || x.venue_name.includes('Hammond')));
}
run();
