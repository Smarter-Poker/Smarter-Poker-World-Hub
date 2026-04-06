require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.agent/skills/credentials/.env', override: false });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: pe, error } = await supabase
        .from('poker_events')
        .select('source, series_uid, start_date')
        
    if (error) {
        console.log("Error:", error);
    } else {
        const sourceCounts = {};
        const yearMonths = {};
        
        pe.forEach(e => {
            sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
            const ym = e.start_date ? e.start_date.substring(0, 7) : 'unknown';
            yearMonths[ym] = (yearMonths[ym] || 0) + 1;
        });
        
        console.log("By source:");
        console.table(sourceCounts);
        console.log("By YYYY-MM:");
        console.table(yearMonths);
    }
}
check();
