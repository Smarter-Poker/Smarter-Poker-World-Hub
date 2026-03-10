const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getTournaments() {
    // Hack to get distinct: we'll just fetch a bunch 
    const { data, error } = await supabaseAdmin.from('tournaments').select('status').limit(1000);
    if (error) {
        console.error("Error:", error);
    } else {
        const distinct = [...new Set(data.map(d => d.status))];
        console.log("Distinct existing statuses:", distinct);
    }
}

getTournaments();
