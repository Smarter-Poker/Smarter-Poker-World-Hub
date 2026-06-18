import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'deploy/mlb.env' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data, error } = await supabase.rpc('get_mlb_validation_stats');
    console.log("Existing RPC test:", error ? error.message : "Success");
    
    // get columns
    const { data: cols, error: err } = await supabase.from('backtest_market_output').select('*').limit(1);
    console.log(cols ? Object.keys(cols[0] || {}) : err);
}
main();
