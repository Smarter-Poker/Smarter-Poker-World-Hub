const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await db.from('backtest_market_output').select('as_of_ts, market, brier_score, unit_profit, rec, actual_result').limit(1);
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
