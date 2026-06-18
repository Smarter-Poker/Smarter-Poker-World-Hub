const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function run() {
    const { data, error } = await db.rpc('exec_sql', { sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'backtest_market_output';" });
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
