import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    LIVE_TREASURY_CONFIG,
    computeAnalyticalBreakEven,
    runFullEconomySimulation,
} from '../src/lib/trivia/economySimulationMonteCarlo.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const LOCK_ORDER_MIGRATION =
    'supabase/migrations/20261124061800_trivia_finalize_question_lock_order.sql';
const ALERT_DRILL_DIR = 'scripts/trivia/p11-alert-killswitch-replica-tests';

test('20261124061800 deadlock migration guards live MD5s, adds ascending lock order, and preserves owner-only ACLs', () => {
    const sql = read(LOCK_ORDER_MIGRATION);
    const rbIdx = sql.indexOf('/* FORWARD ROLLBACK');
    assert.ok(rbIdx > 0, 'migration must include a pasteable FORWARD ROLLBACK block');

    const forward = sql.slice(0, rbIdx);
    const rollback = sql.slice(rbIdx);

    assert.match(forward, /91bae82c164495c0a787a099be5e8883/, 'must verify trivia_p3_finalize_session pre-image MD5');
    assert.match(forward, /6c2a025ff90351ea28adf474a0e966b0/, 'must verify trivia_p3_finalize_session_v4 pre-image MD5');
    assert.match(forward, /CREATE OR REPLACE FUNCTION public\.trivia_p3_finalize_session\(/);
    assert.match(forward, /CREATE OR REPLACE FUNCTION public\.trivia_p3_finalize_session_v4\(/);

    const lockMatches = forward.match(/ORDER BY q\.id ASC[\s\S]*?FOR NO KEY UPDATE;/g) || [];
    assert.equal(lockMatches.length, 2, 'both finalize_session and finalize_session_v4 must acquire ascending locks');

    assert.match(
        forward,
        /REVOKE ALL ON FUNCTION public\.trivia_p3_finalize_session\(uuid, text, uuid\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    assert.match(
        forward,
        /REVOKE ALL ON FUNCTION public\.trivia_p3_finalize_session_v4\(uuid, text, uuid\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    assert.match(forward, /NOTIFY pgrst, 'reload schema';/);
    assert.doesNotMatch(forward, /ca\.allow_function_rollback/, 'forward apply must not set rollback bypass');

    assert.match(rollback, /SET LOCAL ca\.allow_function_rollback = 'public\.trivia_p3_finalize_session';/);
    assert.match(rollback, /SET LOCAL ca\.allow_function_rollback = 'public\.trivia_p3_finalize_session_v4';/);
    assert.equal((rollback.match(/\*\//g) || []).length, 1, 'rollback block comment must not have nested terminators');
});

test('Phase 11 alert and kill-switch PG17 drill suite covers all 8 alerts, kill switches, RBAC, and cleanup', () => {
    const runner = read(`${ALERT_DRILL_DIR}/run.sh`);
    const fixture = read(`${ALERT_DRILL_DIR}/00_fixture.sql`);
    const drills = read(`${ALERT_DRILL_DIR}/10_drills.sql`);

    assert.match(runner, /PostgreSQL 17/);
    assert.match(runner, /PHASE6_POSTGRES_BIN/);
    assert.match(runner, /trap cleanup EXIT INT TERM/);
    assert.match(runner, /20261005234000_trivia_p11_operations_authority\.sql/);
    assert.match(runner, /macOS replica scratch must live under \/Volumes\/SmarterWork\/agent-work/);
    assert.match(fixture, /SECRET_ANSWER_NEVER_EXPOSE/);

    for (const code of [
        'eligible_pool_short',
        'horse_field_missing',
        'horse_field_short',
        'scheduler_duplicate_owner',
        'settlement_escrow_nonzero',
        'settlement_reconciliation_open',
        'tournament_match_stuck',
        'tournament_round_stuck',
    ]) {
        assert.match(drills, new RegExp(`'${code}'`), `alert drill must trigger and verify ${code}`);
    }
    for (const check of [
        /pvp_joins_set/,
        /pvp_horses_set/,
        /idempotency_conflict/,
        /pvp_recover/,
        /tournament_recover_settlement/,
        /operator_capability_required/,
        /trivia_operator_support_lookup_v1/,
    ]) {
        assert.match(drills, check);
    }
});

test('30/90-day live-config economy simulator conserves every trajectory and computes exact break-even thresholds', () => {
    assert.deepEqual(LIVE_TREASURY_CONFIG, {
        openingBalance: 25000,
        floor: 0,
        dailyCeiling: 3000,
        exposureCeiling: 3000,
        warningLevel: 6000,
    });

    const sim = runFullEconomySimulation({ trials: 200, seed: 20261124 });
    assert.equal(sim.contract, 'trivia-economy-forecast/2');
    assert.equal(sim.reports.length, 24);
    assert.equal(sim.monteCarlo.length, 12);

    const hashes = Object.fromEntries(sim.ruleHashes.map((r) => [r.id, r.sha256]));
    assert.equal(hashes['tournament.nightly@1'], '21af11425b85ffd408e211ddaf7011885bcb9a7e2467e07a776e75ef6310b020');
    assert.equal(hashes['pvp.standard@2'], '6cb96043bb1cf6be3d3194d28fc8868dd4cac997ae19ceacfd3da4a017e21026');

    assert.equal(sim.reports.filter((r) => r.sustainableAtRequestedVolume).length, 13);
    for (const r of sim.reports) {
        assert.equal(r.variance, 0);
        assert.equal(r.terminalEscrow, 0);
        assert.ok(r.minBalance >= 0);
    }

    for (const m of sim.monteCarlo) {
        assert.equal(m.invariants.variance, 0, `${m.regime} ${m.days}d must conserve every journal`);
        assert.equal(m.invariants.maxTerminalEscrow, 0, `${m.regime} ${m.days}d must end with zero escrow`);
        assert.equal(m.invariants.allTrajectoriesConserved, true);
        assert.ok(m.treasuryBalance.minIntradayEver >= 0);
    }

    const s2_30 = sim.monteCarlo.find((m) => m.regime === 'S2_Growth_Normal' && m.days === 30);
    const s6_30 = sim.monteCarlo.find((m) => m.regime === 'S6_DailyCeiling_Stress' && m.days === 30);
    assert.ok(s2_30.dailyAvg.platformNet > 0, 'balanced growth regime must be platform-net positive');
    assert.equal(s2_30.limitsAndRisk.floorHitPct, 0, 'balanced growth 30d must not hit treasury floor');
    assert.ok(s6_30.limitsAndRisk.meanDailyCapDays >= 25, 'stress regime must exercise 3,000/day subsidy ceiling');

    const be = computeAnalyticalBreakEven();
    assert.equal(be.pvpTreasuryBreakEvenHumanWinRate, 44.44);
    assert.equal(be.pvpPlatformBreakEvenHumanWinRate, 55.56);
    const equalSkillTourn = be.tournament.find((row) => row.humanSkillRatioAlpha === 1.0);
    assert.equal(equalSkillTourn.platformConsolidatedBreakEvenHumans, 0);
    assert.equal(equalSkillTourn.expectedDailyTreasuryDrawAt20Humans, 105);
});
