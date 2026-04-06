require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env', override: false });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: venues, error } = await supabase
        .from('poker_venues')
        .select('*')
        .ilike('name', '%Grand Victoria%');
        
    if (error) {
        console.log("Error:", error);
    } else {
        console.log(`Found ${venues.length} venues:`);
        venues.forEach(v => {
            console.log(`ID: ${v.id} | Name: ${v.name} | Address: ${v.address} | Source: ${v.source} | Logo: ${v.logo_url}`);
        });
    }
}
check();
