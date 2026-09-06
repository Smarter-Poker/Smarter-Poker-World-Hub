/**
 * Phase 1 competitive Trivia containment verifier.
 *
 * This intentionally verifies the system that is safe to operate now, not the
 * retired browser/worker tournament engine. Run after the Phase 1 migration
 * with production-equivalent server credentials.
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const {
    verifyPhase1ProductionDatabase,
} = require('./trivia/phase1-production-db-verify.cjs');

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
    if (ok) {
        passed += 1;
        console.log(`  PASS ${label}${detail ? `: ${detail}` : ''}`);
    } else {
        failed += 1;
        console.error(`  FAIL ${label}${detail ? `: ${detail}` : ''}`);
    }
}

function hasActiveSchedule(source, path) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^\\s*\\('${escaped}'\\s*,`, 'm').test(source);
}

function hasActiveWorkerRoute(source, path) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^\\s*'${escaped}'\\s*:`, 'm').test(source);
}

const CONTAINMENT_TABLE_COUNT_COLUMNS = Object.freeze({
    trivia_pvp_session_links: 'match_id',
    trivia_pvp_active_seats: 'match_id',
    trivia_pvp_settlement_decisions: 'match_id',
    competitive_quarantine: 'entity_type',
});

async function tableCount(sb, table, configure = query => query, column = 'id') {
    const { count, error } = await configure(
        sb.from(table).select(column, { count: 'exact', head: true }),
    );
    return { count, error };
}

async function main() {
    console.log('Phase 1 competitive Trivia containment verification');

    const envExample = fs.readFileSync('.env.example', 'utf8');
    for (const name of [
        'TRIVIA_PVP_ENABLED',
        'TRIVIA_PVP_HORSES_ENABLED',
        'TRIVIA_TOURNAMENTS_ENABLED',
        'TRIVIA_TOURNAMENT_HORSES_ENABLED',
    ]) {
        check(`${name} documented default-off`, new RegExp(`^${name}=false$`, 'm').test(envExample));
        check(`${name} is not enabled in this environment`, process.env[name] !== 'true');
    }

    const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const vercelPaths = new Set((vercel.crons || []).map(cron => cron.path));
    const dispatcher = fs.readFileSync('scripts/openclaw-cron-dispatcher.py', 'utf8');
    for (const path of [
        '/api/cron/trivia-pvp-cleanup',
        '/api/cron/pvp-settle',
        '/api/cron/trivia-tournaments',
        '/api/cron/trivia-tournament-rounds',
        '/api/cron/trivia-tournament-tick',
    ]) {
        check(`${path} absent from Vercel schedules`, !vercelPaths.has(path));
        check(`${path} absent from OpenClaw schedules`, !hasActiveSchedule(dispatcher, path));
        check(`${path} absent from worker routing`, !hasActiveWorkerRoute(dispatcher, path));
    }

    check('legacy PvP cron source removed', !fs.existsSync('pages/api/cron/trivia-pvp-cleanup.js'));
    check('legacy tournament cron source removed', !fs.existsSync('pages/api/cron/trivia-tournaments.js'));
    check('legacy round cron source removed', !fs.existsSync('pages/api/cron/trivia-tournament-rounds.js'));
    check('single future tournament tick exists', fs.existsSync('pages/api/cron/trivia-tournament-tick.js'));
    check('single PvP settlement sweep exists', fs.existsSync('pages/api/cron/pvp-settle.js'));

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });

    for (const [table, column] of Object.entries(CONTAINMENT_TABLE_COUNT_COLUMNS)) {
        const { count, error } = await tableCount(sb, table, query => query, column);
        check(`${table} is service-readable`, !error, error?.message || `${count} rows`);
    }

    const pvpOpen = await tableCount(sb, 'trivia_pvp_matches', query =>
        query.in('status', ['active', 'settling']));
    check('no open PvP matches at containment baseline', !pvpOpen.error && pvpOpen.count === 0,
        pvpOpen.error?.message || `${pvpOpen.count} rows`);

    const queueWaiting = await tableCount(sb, 'trivia_pvp_queue', query => query.eq('status', 'waiting'));
    check('no waiting PvP queue rows at containment baseline',
        !queueWaiting.error && queueWaiting.count === 0,
        queueWaiting.error?.message || `${queueWaiting.count} rows`);

    const tournamentsOpen = await tableCount(sb, 'trivia_tournaments', query =>
        query.in('status', ['upcoming', 'active']));
    check('no open legacy tournaments at containment baseline',
        !tournamentsOpen.error && tournamentsOpen.count === 0,
        tournamentsOpen.error?.message || `${tournamentsOpen.count} rows`);

    await verifyPhase1ProductionDatabase(check);

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(error => {
    console.error('Verification failed:', error?.message || error);
    process.exitCode = 1;
});
