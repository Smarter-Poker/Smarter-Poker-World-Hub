import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const mlbDb = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('Checking get_mlb_validation_stats...');
    const { data: stats, error } = await mlbDb.rpc('get_mlb_validation_stats', {
        cutoff: null
    });
    console.log('Error:', error);
    console.log('Stats:', JSON.stringify(stats, null, 2));

    const { count, error: err2 } = await mlbDb.from('backtest_market_output').select('*', { count: 'exact', head: true });
    console.log('Total rows in backtest_market_output:', count, 'Error:', err2);
}
check();
