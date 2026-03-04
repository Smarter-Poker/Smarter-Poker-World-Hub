const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub', '.env.local') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log('Checking horse tables on production Supabase...');

    // Check which tables exist
    const tables = ['horse_session_stats', 'horse_opponent_reads', 'horse_hand_history', 'horse_threat_intel', 'horse_table_presence'];

    for (const table of tables) {
        const { data, error } = await sb.from(table).select('*').limit(1);
        if (error) {
            console.log(`❌ ${table}: ${error.message}`);
        } else {
            console.log(`✅ ${table}: EXISTS (${data.length} rows sampled)`);
        }
    }

    // Also check profiles.is_horse column
    const { data: horseCheck, error: horseErr } = await sb
        .from('profiles')
        .select('id, alias')
        .eq('is_horse', true)
        .limit(5);

    if (horseErr) {
        console.log(`❌ profiles.is_horse: ${horseErr.message}`);
    } else {
        console.log(`✅ profiles.is_horse: ${horseCheck.length} horses found`);
        horseCheck.forEach(h => console.log(`   🐴 ${h.alias || h.id.substring(0, 8)}`));
    }

    // Check memory_charts_gold (PioSolver)
    const { data: gtoData, error: gtoErr } = await sb
        .from('memory_charts_gold')
        .select('id')
        .limit(1);

    if (gtoErr) {
        console.log(`❌ memory_charts_gold (PioSolver): ${gtoErr.message}`);
    } else {
        console.log(`✅ memory_charts_gold (PioSolver): EXISTS (has data: ${(gtoData || []).length > 0})`);
    }

    // Check solved_spots_gold (PioSolver postflop)
    const { data: solvedData, error: solvedErr } = await sb
        .from('solved_spots_gold')
        .select('id')
        .limit(1);

    if (solvedErr) {
        console.log(`❌ solved_spots_gold (PioSolver): ${solvedErr.message}`);
    } else {
        console.log(`✅ solved_spots_gold (PioSolver): EXISTS (has data: ${(solvedData || []).length > 0})`);
    }
}

run().catch(e => console.error('FATAL:', e.message));
