const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { createSolverOperatorPool } = require('../../../../scripts/lib/solver-operator-db');
require('dotenv').config({
    path: process.env.HORSE_TABLE_AUDIT_ENV_FILE
        ? path.resolve(process.env.HORSE_TABLE_AUDIT_ENV_FILE)
        : path.resolve(process.cwd(), '.env.local'),
});

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
        'Horse-table audit requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.debug('Checking horse tables on production Supabase...');
    const failures = [];

    // Check which tables exist
    const tables = ['horse_session_stats', 'horse_opponent_reads', 'horse_hand_history', 'horse_threat_intel', 'horse_table_presence'];

    for (const table of tables) {
        const { data, error } = await sb.from(table).select('*').limit(1);
        if (error) {
            console.debug(`❌ ${table}: ${error.message}`);
            failures.push(`${table}: ${error.message}`);
        } else {
            console.debug(`✅ ${table}: EXISTS (${data.length} rows sampled)`);
        }
    }

    // Also check profiles.is_horse column
    const { data: horseCheck, error: horseErr } = await sb
        .from('profiles')
        .select('id, alias')
        .eq('is_horse', true)
        .limit(5);

    if (horseErr) {
        console.debug(`❌ profiles.is_horse: ${horseErr.message}`);
        failures.push(`profiles.is_horse: ${horseErr.message}`);
    } else {
        console.debug(`✅ profiles.is_horse: ${horseCheck.length} horses found`);
        horseCheck.forEach(h => console.debug(`   🐴 ${h.alias || h.id.substring(0, 8)}`));
    }

    // Phase 6 revoked service_role direct SELECT on the solver warehouse.
    // Keep these two probes on a read-only DB-owner connection; horse-table
    // checks above remain on the service client because they are unrelated.
    let operatorPool;
    try {
        operatorPool = createSolverOperatorPool();
        const { rows: chartRows } = await operatorPool.query(
            'SELECT 1 FROM public.memory_charts_gold LIMIT 1',
        );
        console.debug(`✅ memory_charts_gold (PioSolver): EXISTS (has data: ${chartRows.length > 0})`);
        const { rows: solvedRows } = await operatorPool.query(
            'SELECT 1 FROM public.solved_spots_gold LIMIT 1',
        );
        console.debug(`✅ solved_spots_gold (PioSolver): EXISTS (has data: ${solvedRows.length > 0})`);
    } catch (error) {
        console.debug(`❌ Solver warehouse probes failed: ${error.message}`);
        console.debug('   Set SUPABASE_DB_PASSWORD to run these required probes; service_role is intentionally rejected.');
        throw error;
    } finally {
        if (operatorPool) await operatorPool.end();
    }
    if (failures.length > 0) {
        throw new Error(`Horse-table audit failed: ${failures.join('; ')}`);
    }
}

run().catch(e => {
    console.error('FATAL:', e.message);
    process.exitCode = 1;
});
