const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function regen() {
    const { data: venues } = await supabase.from('poker_venues').select('*');
    if (venues) {
        fs.writeFileSync('./public/data/all-venues.json', JSON.stringify({ venues: venues }, null, 2));
        fs.writeFileSync('./data/all-venues.json', JSON.stringify(venues, null, 2));
        console.log(`Saved ${venues.length} venues to public/data/all-venues.json and data/all-venues.json`);
    } else {
        console.error("No venues found.");
    }
}
regen();
