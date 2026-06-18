const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const mlbDb = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: insertData, error: insertError } = await mlbDb.from('backtest_accuracy').insert([{}]).select();
    console.log("Insert Error:", insertError);
}
run();
