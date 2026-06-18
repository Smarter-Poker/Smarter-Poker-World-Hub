const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await db.from('backtest_market_output').select('edge_pts').limit(1);
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
