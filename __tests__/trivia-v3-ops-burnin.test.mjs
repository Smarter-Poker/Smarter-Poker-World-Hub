/**
 * Track 1 regression & contract guard:
 *  - Migration 20261124142200 (Survival V3 per-level difficulty + supervisor
 *    treasury replenishment from accumulated rake)
 *  - V3 Solo API alignment (session-start Survival difficulty, daily V3 roster)
 *  - Ops Console upgrade (solo_journal DB switch, Tonight 8 PM CT Fill Monitor,
 *    Unit-Economics & Treasury Headroom, Replenish Treasury From Rake action)
 *  - 7-Night Burn-In Scorecard CLI (`scripts/trivia/verify-nightly-burnin.mjs`)
 *  - 7:00 PM CT OpenClaw read-only pre-flight readiness check
 *  - CI PG17 alert/kill-switch drill gate & Legacy Retirement Inventory
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    buildTriviaOperationsSnapshot,
    parseOperationsActionRequest,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';
import {
    expectedBurnInDates,
    formatHumanScorecard,
    gradeNightlyBurnIn,
} from '../scripts/trivia/verify-nightly-burnin.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('migration 20261124142200 enforces predecessor MD5s, Survival V3 difficulty, and supervisor treasury replenishment', () => {
    const sql = read('supabase/migrations/20261124142200_trivia_v3_survival_difficulty_and_treasury_ops.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /63ec2657faf23f28b745bcebacb37b85/, 'preflight MD5 for trivia_p3_candidates_v1');
    assert.match(sql, /f778e2b3c8c956db0550bfe449aa19b1/, 'preflight MD5 for trivia_start_solo_session_v3');
    assert.match(sql, /7d5247c334dc15e6899301f7fd2dd14f/, 'preflight MD5 for trivia_operator_execute_v1');

    // Survival V3 per-level difficulty & fallback
    assert.match(sql, /trivia\.p3_survival_difficulty/);
    assert.match(sql, /v_p\.mode = 'survival' AND v_req_diff IN \('easy', 'medium', 'hard'\)/);
    assert.match(sql, /WHEN v_target_level <= 2 THEN 'easy'/);
    assert.match(sql, /WHEN v_target_level <= 5 THEN 'medium'/);
    assert.match(sql, /ELSE 'hard'/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.trivia_start_solo_session_v3\(\s*p_session_id uuid,\s*p_user_id uuid,\s*p_mode text,\s*p_parent_session_id uuid,\s*p_difficulty text\s*\)/s);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.trivia_start_solo_session_v3\(\s*p_session_id uuid,\s*p_user_id uuid,\s*p_mode text,\s*p_parent_session_id uuid DEFAULT NULL::uuid\s*\)/s);

    // Supervisor treasury replenishment from rake
    assert.match(sql, /'treasury_replenish_from_rake'/);
    assert.match(sql, /v_context->'roles' \? 'supervisor'/);
    assert.match(sql, /house:rake:tournament/);
    assert.match(sql, /house:rake:pvp/);
    assert.match(sql, /treasury:trivia/);
    assert.match(sql, /insufficient_rake_balance/);
    assert.match(sql, /public\.trivia_ledger_post\(/);
    assert.match(sql, /'approved_by',\s*'supervisor:' \|\| p_operator_id::text/);
    assert.match(sql, /INSERT INTO public\.trivia_operator_events_v1/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.doesNotMatch(sql, /UPDATE public\.trivia_operator_roles_v1/i, 'append-only roles table stays untouched');
    assert.doesNotMatch(sql, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);
});

test('V3 API alignment passes Survival difficulty and resolves canonical V3 Daily roster', () => {
    const start = read('pages/api/trivia/session-start.js');
    assert.match(start, /async function startOrResumeSoloV3\([^)]*difficulty = null\)/);
    assert.match(start, /\.\.\.\(mode === 'survival' \? \{ p_difficulty: survivalDifficulty \} : \{\}\)/);
    assert.match(start, /startOrResumeSoloV3\(res, sb, userId, mode, startNonce, parentSessionId, false, survivalDifficulty\)/);

    const daily = read('pages/api/trivia/daily.js');
    assert.match(daily, /import \{ isSoloEngineV3Enabled \} from '\.\.\/\.\.\/\.\.\/src\/lib\/trivia\/phase3Engine\.mjs'/);
    assert.match(daily, /supabase\.rpc\('trivia_build_roster_v1'/);
    assert.match(daily, /p_scope_kind:\s*'daily'/);
    assert.match(daily, /p_profile_id:\s*V3_DAILY_PROFILE_ID/);
    assert.match(daily, /rosterSource = 'v3_roster'/);
    assert.match(daily, /toPublicQuestion\(\{/);
});

test('operationsSnapshot enforces supervisor treasury_replenish_from_rake validation and exposes DB switch, fill monitor, and economics', () => {
    const valid = parseOperationsActionRequest({
        requestKey: 'ops-replenish-20261124-01',
        action: 'treasury_replenish_from_rake',
        reason: 'Replenish trivia treasury from accumulated tournament and PvP rake.',
        targetId: null,
        payload: { replenishAmount: 50 },
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value.payload.replenishAmount, 50);

    for (const bad of [
        { ...valid.value, payload: { replenishAmount: 0 } },
        { ...valid.value, payload: { replenishAmount: -10 } },
        { ...valid.value, payload: { replenishAmount: 12.5 } },
        { ...valid.value, payload: { replenishAmount: 2_000_000 } },
        { ...valid.value, payload: { amount: 50 } },
        { ...valid.value, targetId: '00000000-0000-4000-8000-000000000001', payload: { replenishAmount: 50, extra: 1 } },
    ]) {
        assert.equal(parseOperationsActionRequest(bad).ok, false);
    }

    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-25T00:00:00.000Z', // 6:00 PM CT on 2026-11-24
        controls: triviaOperationsControls({ TRIVIA_P3_SOLO_ENGINE_V3: 'true' }),
        operatorContext: {
            allowed: true,
            roles: ['supervisor'],
            capabilities: ['snapshot', 'settlement_control'],
        },
        soloJournalSwitch: {
            key: 'solo_journal',
            enabled: true,
            reason: 'Phase 12 cutover',
            updated_at: '2026-11-24T07:11:55.000Z',
        },
        ledgerHealth: {
            healthy: true,
            exception_count: 0,
            metrics: { solo_journal_switch: true, treasury_balance: 25008, treasury_floor: 0, treasury_below_warning: false },
            findings: { ledger_imbalance_global: 0, account_balance_drift: 0, nonzero_terminal_escrow: 0, settlement_unexplained_variance: 0, treasury_below_floor: false },
        },
        ledgerAccounts: [
            { account_code: 'treasury:trivia', balance: 25008, min_balance: 0, state: 'open' },
            { account_code: 'house:rake:tournament', balance: 71, min_balance: 0, state: 'open' },
            { account_code: 'house:rake:pvp', balance: 8, min_balance: 0, state: 'open' },
        ],
        ledgerConfig: [
            { key: 'treasury_warning_level', value: 6000 },
            { key: 'treasury_floor', value: 0 },
        ],
        pvpMetrics: {
            matches: { human_human: 6, human_horse: 4 },
            tickets: { matched_human: 12, matched_horse: 4 },
        },
        activeTournaments: [
            {
                tournament_id: '41b958e0-655b-46fa-97d5-4f92c8b80874',
                schedule_kind: 'public_nightly',
                scheduled_local_date: '2026-11-24',
                start_time: '2026-11-25T02:00:00.000Z',
                lifecycle_state: 'registration',
                horse_population_mode: 'pending',
                horses_entered: 40,
                horse_target: 100,
                humans_entered: 12,
            },
        ],
    });

    assert.equal(snapshot.healthy, true);
    assert.equal(snapshot.db_switches.solo_journal.enabled, true);
    assert.equal(snapshot.treasury_economics.treasury_balance, 25008);
    assert.equal(snapshot.treasury_economics.treasury_warning_level, 6000);
    assert.equal(snapshot.treasury_economics.treasury_below_warning, false);
    assert.equal(snapshot.treasury_economics.treasury_headroom_above_warning, 19008);
    assert.equal(snapshot.treasury_economics.rake_accounts.total_available, 79);
    assert.equal(snapshot.treasury_economics.pvp_24h_mix.human_share_pct, 60);
    assert.equal(snapshot.treasury_economics.pvp_24h_mix.horse_share_pct, 40);
    assert.equal(snapshot.tonight_fill_monitor.horses_entered, 40);
    assert.equal(snapshot.tonight_fill_monitor.horse_target, 100);
    assert.equal(snapshot.tonight_fill_monitor.fill_pct, 40);
    assert.equal(snapshot.tonight_fill_monitor.seconds_to_fill_start, 4500);
    assert.equal(snapshot.tonight_fill_monitor.seconds_to_reconcile, 7080);
    assert.equal(snapshot.tonight_fill_monitor.seconds_to_start, 7200);
    assert.ok(snapshot.available_actions.includes('treasury_replenish_from_rake'));

    // Non-supervisor settlement_operator cannot see treasury_replenish_from_rake
    const nonSupervisor = buildTriviaOperationsSnapshot({
        operatorContext: {
            allowed: true,
            roles: ['settlement_operator'],
            capabilities: ['snapshot', 'settlement_control'],
        },
    });
    assert.equal(nonSupervisor.available_actions.includes('treasury_replenish_from_rake'), false);
});

test('admin API and Ops Console page wire solo_journal switch, fill monitor, economics, and treasury replenish', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(api, /from\('trivia_ledger_switches'\)/);
    assert.match(api, /rpc\('trivia_ledger_health_v1'\)/);
    assert.match(api, /from\('trivia_ledger_accounts'\)/);
    assert.match(api, /house:rake:tournament/);
    assert.match(api, /house:rake:pvp/);

    const page = read('pages/admin/trivia-operations.js');
    assert.match(page, /solo journal \(DB switch\)/);
    assert.match(page, /Tonight at 8:00 PM CT fill monitor/);
    assert.match(page, /Countdown to 7:15 PM CT fill/);
    assert.match(page, /Countdown to 7:58 PM CT reconcile/);
    assert.match(page, /Countdown to 8:00 PM CT start/);
    assert.match(page, /Unit-economics and treasury headroom/);
    assert.match(page, /Replenish Treasury From Rake/);
    assert.match(page, /action:\s*'treasury_replenish_from_rake'/);
    assert.doesNotMatch(page, /—|–/, 'UI text must never contain em-dashes or en-dashes');
});

test('verify-nightly-burnin grades 7-night window against all 6 Phase 12 SLOs', () => {
    const dates = expectedBurnInDates('2026-11-24', 7);
    assert.deepEqual(dates, [
        '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
        '2026-11-28', '2026-11-29', '2026-11-30',
    ]);

    const makeGreenRow = (date, idx) => ({
        tournament_id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
        scheduled_local_date: date,
        start_time: `${date}T02:00:00.000Z`,
        lifecycle_state: 'settled',
        horse_target: 100 + idx,
        horses_entered: 100 + idx,
        humans_entered: 15,
        start_delay_seconds: 12,
        charged_entrants: 115 + idx,
        excluded_charged_entrants: 0,
        event_duration_seconds: 1850,
        event_budget_seconds: 3600,
        stuck_rounds: 0,
        settlement_state: 'settled',
        settlement_latency_seconds: 18,
        settlement_sla_seconds: 60,
        escrow_balance: 0,
        ledger_variance: 0,
    });

    const certified = gradeNightlyBurnIn(dates.map(makeGreenRow), {
        startDate: '2026-11-24',
        days: 7,
        ledgerHealth: { healthy: true, exception_count: 0 },
    });
    assert.equal(certified.scorecard, '7/7');
    assert.equal(certified.certified, true);
    assert.equal(certified.summary.passed, 7);
    assert.equal(certified.summary.failed, 0);
    assert.match(formatHumanScorecard(certified), /7\/7 \(CERTIFIED\)/);

    // Breach every SLO individually on one night each
    const broken = dates.map(makeGreenRow);
    broken[0].horses_entered = 99; // SLO 1
    broken[1].start_delay_seconds = 61; // SLO 2
    broken[2].excluded_charged_entrants = 1; // SLO 3
    broken[3].stuck_rounds = 1; // SLO 4
    broken[4].settlement_latency_seconds = 75; // SLO 5
    broken[5].escrow_balance = 10; // SLO 6
    const failed = gradeNightlyBurnIn(broken, {
        startDate: '2026-11-24',
        days: 7,
        ledgerHealth: { healthy: true, exception_count: 0 },
    });
    assert.equal(failed.scorecard, '1/7');
    assert.equal(failed.certified, false);
    assert.equal(failed.summary.failed, 6);
    assert.equal(failed.nights[0].slos.horse_target_exact.passed, false);
    assert.equal(failed.nights[1].slos.start_within_60s.passed, false);
    assert.equal(failed.nights[2].slos.all_charged_in_bracket.passed, false);
    assert.equal(failed.nights[3].slos.within_event_budget.passed, false);
    assert.equal(failed.nights[4].slos.settlement_within_slo.passed, false);
    assert.equal(failed.nights[5].slos.zero_escrow_and_variance.passed, false);
    assert.equal(failed.nights[6].status, 'passed');
});

test('OpenClaw 7:00 PM CT read-only pre-flight evaluator grades ready, warning, and fail accurately', () => {
    const pyCode = `
import importlib.util, json, sys, types
# Stub apscheduler and requests if not installed in this Python env
for mod in ('requests', 'apscheduler', 'apscheduler.schedulers', 'apscheduler.schedulers.blocking', 'apscheduler.triggers', 'apscheduler.triggers.cron'):
    if mod not in sys.modules:
        m = types.ModuleType(mod)
        m.BlockingScheduler = object
        m.CronTrigger = object
        m.RequestException = Exception
        m.exceptions = types.SimpleNamespace(Timeout=TimeoutError)
        sys.modules[mod] = m
spec = importlib.util.spec_from_file_location('oc', 'scripts/openclaw-cron-dispatcher.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ready = mod.evaluate_trivia_nightly_preflight(
    {'healthy': True, 'upcoming_public_instances': 7},
    {'healthy': True, 'exception_count': 0},
    {'ledger_clean': True, 'treasury': {'balance': 25000}, 'gates': {'tournament_public': {'enabled': True}, 'tournament_horses': {'enabled': True}, 'tournament_scheduler': {'enabled': True}}},
)
warn = mod.evaluate_trivia_nightly_preflight(
    {'healthy': True, 'upcoming_public_instances': 7},
    {'healthy': True, 'exception_count': 0},
    {'ledger_clean': True, 'treasury': {'balance': 4500}, 'gates': {'tournament_public': {'enabled': True}, 'tournament_horses': {'enabled': True}, 'tournament_scheduler': {'enabled': True}}},
)
fail = mod.evaluate_trivia_nightly_preflight(
    {'healthy': False, 'upcoming_public_instances': 5},
    {'healthy': False, 'exception_count': 2},
    {'ledger_clean': False, 'treasury': {'balance': 25000}, 'gates': {'tournament_public': {'enabled': True}, 'tournament_horses': {'enabled': False}, 'tournament_scheduler': {'enabled': True}}},
)
print(json.dumps({'ready': ready, 'warn': warn, 'fail': fail}))
`;
    const proc = spawnSync('python3', ['-c', pyCode], { cwd: ROOT, encoding: 'utf8', timeout: 15_000 });
    assert.equal(proc.status, 0, `python preflight check failed: ${proc.stderr}`);
    const out = JSON.parse(proc.stdout.trim().split('\n').at(-1));
    assert.equal(out.ready.status, 'ready');
    assert.equal(out.warn.status, 'warning');
    assert.equal(out.fail.status, 'fail');
    assert.ok(out.fail.failures.length >= 4);
});

test('CI workflow wires Phase 11 alert/kill-switch PG17 drills and Legacy Retirement Inventory is complete', () => {
    const workflow = read('.github/workflows/build-safety-gate.yml');
    const gatePath = 'scripts/trivia/p11-alert-killswitch-replica-tests/run.sh';
    assert.equal(workflow.split(gatePath).length - 1, 1, 'alert/killswitch PG17 gate must run exactly once');
    assert.ok(
        workflow.indexOf('Resolve Exact PostgreSQL 17 Training Test Binaries')
            < workflow.indexOf('Trivia Phase 11 Alert And Kill-Switch PostgreSQL 17 Drills'),
        'must run after PG17 binary resolution',
    );

    const inv = read('docs/trivia/PHASE-12-LEGACY-RETIREMENT-INVENTORY.md');
    assert.match(inv, /verify-nightly-burnin\.mjs/);
    assert.match(inv, /pages\/api\/trivia\/submit\.js/);
    assert.match(inv, /pages\/api\/trivia\/pvp-settle-match\.js/);
    assert.match(inv, /pages\/api\/cron\/trivia-tournament-tick\.js/);
    assert.match(inv, /trivia_legacy_session_answer_v1/);
    assert.match(inv, /pg_stat_user_functions/);
});
