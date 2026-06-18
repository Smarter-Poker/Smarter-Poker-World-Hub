const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const mlbDb = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await mlbDb.from('backtest_market_output').select('NON_EXISTENT_COLUMN').limit(1);
    console.log("Error:", error);
}
run();
