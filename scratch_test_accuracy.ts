import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const mlbDb = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await mlbDb.from('backtest_accuracy').select('*').limit(1);
    console.log("Error:", error);
    console.log("Data:", data);
}
run();
