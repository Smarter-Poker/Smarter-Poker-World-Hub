/**
 * Anti-Regression Fortress Suite: Trivia Ops RPC Performance & Stale Session Expiry
 * ─────────────────────────────────────────────────────────────────────────────────
 * Locks the permanent root-cause fixes for:
 *   1. Postgres 57014 statement timeout in trivia_nightly_burnin_scorecard_v1,
 *      trivia_launch_readiness_v1, and trivia_competitive_cutover_status_v1
 *      (all caused by planner pathologies in public.trivia_ledger_recon_reference).
 *   2. Additive lock-safe btree indexes on trivia_ledger_lines,
 *      trivia_tournament_entrants, and trivia_settlement_participants.
 *   3. Hourly stale-session expiry cadence for /api/cron/trivia-pool-guard
 *      (invoking trivia_expire_stale_sessions_v1 so abandoned 6h sessions never
 *      sit open for up to 24h triggering TriviaStaleOpenSessions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = process.cwd();
const MIGRATION_PATH = path.join(
    REPO,
    'supabase/migrations/20261127024200_trivia_ops_rpc_perf_and_indexes.sql',
);
const VERCEL_JSON_PATH = path.join(REPO, 'vercel.json');
const POOL_GUARD_PATH = path.join(REPO, 'pages/api/cron/trivia-pool-guard.js');

function readActiveSql(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const rollbackIdx = raw.indexOf('/* FORWARD ROLLBACK');
    const active = rollbackIdx >= 0 ? raw.slice(0, rollbackIdx) : raw;
    return active.replace(/--[^\n]*/g, '');
}

test('P0 ops perf migration exists, avoids ALTER TABLE locks, and creates all 3 additive indexes', () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), 'Missing migration 20261127024200_trivia_ops_rpc_perf_and_indexes.sql');
    const sql = readActiveSql(MIGRATION_PATH);

    assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i, 'Migration must not take ALTER TABLE locks on live tables');
    assert.match(sql, /SET LOCAL lock_timeout\s*=\s*'5s'/i);
    assert.match(
        sql,
        /CREATE INDEX IF NOT EXISTS trivia_ledger_lines_player_wallet_journal_idx\s+ON public\.trivia_ledger_lines\s*\(journal_id,\s*diamond_transaction_id\)\s+WHERE account_kind = 'player_wallet'/is,
    );
    assert.match(
        sql,
        /CREATE INDEX IF NOT EXISTS trivia_tournament_entrants_entered_field_idx\s+ON public\.trivia_tournament_entrants\s*\(tournament_id,\s*in_field,\s*seed_number\)\s+WHERE entry_state = 'entered'/is,
    );
    assert.match(
        sql,
        /CREATE INDEX IF NOT EXISTS trivia_settlement_participants_settlement_kind_idx\s+ON public\.trivia_settlement_participants\s*\(settlement_id,\s*participant_kind\)/is,
    );
});

test('trivia_ledger_recon_reference preserves security_invoker=true, exact 13 columns, and planner-proof LATERAL + MATERIALIZED CTE', () => {
    const sql = readActiveSql(MIGRATION_PATH);

    assert.match(
        sql,
        /CREATE OR REPLACE VIEW public\.trivia_ledger_recon_reference WITH \(security_invoker = true\) AS/i,
    );

    // Branch 1: PK-pinned LATERAL LIMIT 1 joins prevent LIMIT 1 Materialize+SeqScan regression
    assert.match(sql, /JOIN LATERAL\s*\([\s\S]*?FROM public\.trivia_ledger_journals\s+j0[\s\S]*?WHERE j0\.id = l\.journal_id[\s\S]*?LIMIT 1[\s\S]*?\)\s*j ON true/i);
    assert.match(sql, /LEFT JOIN LATERAL\s*\([\s\S]*?FROM public\.diamond_transactions\s+d0[\s\S]*?WHERE d0\.id = l\.diamond_transaction_id[\s\S]*?LIMIT 1[\s\S]*?\)\s*d ON true/i);
    assert.match(sql, /LEFT JOIN LATERAL\s*\([\s\S]*?FROM public\.ca_diamond_journal_archive\s+ar0[\s\S]*?WHERE ar0\.id = l\.diamond_transaction_id[\s\S]*?LIMIT 1[\s\S]*?\)\s*ar ON true/i);

    // Branch 2: MATERIALIZED CTE ordered by d.created_at pins diamond_transactions_trivia_family_created_idx
    assert.match(
        sql,
        /WITH trivia_platform AS MATERIALIZED\s*\([\s\S]*?FROM public\.diamond_transactions\s+d[\s\S]*?trivia_ledger_platform_family\([\s\S]*?IS NOT NULL[\s\S]*?AND d\.amount <> 0[\s\S]*?ORDER BY d\.created_at/i,
    );

    // Exact 13 output columns preserved
    for (const col of [
        'AS origin',
        'AS journal_id',
        'j.idempotency_key',
        'j.operation',
        'l.line_no',
        'l.user_id',
        'AS reference',
        'AS kind',
        'l.amount',
        'l.diamond_transaction_id',
        'AS platform_amount',
        'AS created_at',
        'AS state',
    ]) {
        assert.ok(sql.includes(col), `trivia_ledger_recon_reference must preserve column expression "${col}"`);
    }

    // Explicit least-privilege view ACL + postflight
    assert.match(sql, /REVOKE ALL ON public\.trivia_ledger_recon_reference FROM PUBLIC, anon, authenticated, service_role;/i);
    assert.match(sql, /GRANT SELECT ON public\.trivia_ledger_recon_reference TO service_role;/i);
    assert.match(sql, /security_invoker=true/);
    assert.match(sql, /NOTIFY pgrst,\s*'reload schema'/i);
});

test('trivia-pool-guard runs hourly to expire stale open sessions via trivia_expire_stale_sessions_v1', () => {
    const vercelCfg = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
    const crons = Array.isArray(vercelCfg.crons) ? vercelCfg.crons : [];
    const poolGuard = crons.find((c) => c.path === '/api/cron/trivia-pool-guard');
    assert.ok(poolGuard, 'vercel.json must schedule /api/cron/trivia-pool-guard');
    assert.equal(
        poolGuard.schedule,
        '30 * * * *',
        'trivia-pool-guard must run hourly at :30 (not once daily) so stale open sessions are expired within 60 minutes',
    );

    const routeSrc = fs.readFileSync(POOL_GUARD_PATH, 'utf8');
    assert.match(routeSrc, /rpc\('trivia_expire_stale_sessions_v1',\s*\{\s*p_limit:\s*500\s*\}\)/);
});
