const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    let row = { "game_pk": "123", "as_of_ts": "2026-06-18T00:00:00Z", "market": "h2h", "brier_score": 0.2, "unit_profit": 1.5, "rec": "BET 1U" };
    const { data: insertData, error: insertError } = await db.from('backtest_market_output').insert([row]).select();
    console.log("Insert Error:", insertError);
    if (!insertError) {
        console.log("Data:", insertData);
        await db.from('backtest_market_output').delete().eq('game_pk', '123');
    }
}
run();
