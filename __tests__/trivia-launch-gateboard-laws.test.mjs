/**
 * Phase 12 Launch Certification Gateboard, 5-Query Legacy-Traffic Observation
 * Window Monitor, and Admin Console MFA Step-Up UX Anti-Regression Laws.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    LAUNCH_READINESS_GATE_KEYS,
    LEGACY_OBSERVATION_RPC_NAMES,
    buildTriviaOperationsSnapshot,
    normalizeLaunchReadiness,
    normalizeLegacyObservation,
    normalizeOperatorMfa,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';
import {
    ACTIVE_UNTIL_FOLDED_RPC,
    buildLegacyObservationSql,
    formatHumanLegacyObservation,
    parseCliArgs,
} from '../scripts/trivia/verify-legacy-observation.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('migration 20261126010500 enforces all 5 Phase 12 legacy SQL queries, append-only RLS tables, and zero auto-passed signoffs', () => {
    const sql = read('supabase/migrations/20261126010500_trivia_launch_gateboard_and_legacy_observation.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);

    const activeSql = sql.split('/* FORWARD ROLLBACK')[0]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '');

    // Must never ALTER any live gameplay table (only ENABLE/FORCE RLS on our two new tables)
    const alterMatches = [...activeSql.matchAll(/\bALTER\s+TABLE\s+([^\s;]+)/gi)].map((m) => m[1]);
    for (const table of alterMatches) {
        assert.ok(
            table === 'public.trivia_legacy_observation_baselines_v1'
            || table === 'public.trivia_launch_gate_signoffs_v1',
            `Unexpected ALTER TABLE on live table: ${table}`,
        );
    }

    // Never grant anything to anon/authenticated/PUBLIC
    assert.doesNotMatch(activeSql, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);

    // Must NEVER auto-insert passed human/MFA signoff rows in migration body
    const outsideFunctions = activeSql.replace(/\$function\$[\s\S]*?\$function\$/g, '');
    assert.doesNotMatch(
        outsideFunctions,
        /INSERT\s+INTO\s+public\.trivia_launch_gate_signoffs_v1/i,
        'Migration must never auto-insert gate signoff rows',
    );

    // Both append-only tables with RLS + FORCE RLS + append-only triggers
    assert.match(activeSql, /CREATE TABLE IF NOT EXISTS public\.trivia_legacy_observation_baselines_v1/);
    assert.match(activeSql, /CREATE TABLE IF NOT EXISTS public\.trivia_launch_gate_signoffs_v1/);
    assert.match(activeSql, /'operator_mfa_http_write'/);
    assert.match(activeSql, /'physical_ios_review'/);
    assert.match(activeSql, /'physical_android_review'/);
    assert.match(activeSql, /'physical_push_receipt'/);
    assert.match(activeSql, /BEFORE UPDATE OR DELETE ON public\.trivia_legacy_observation_baselines_v1/);
    assert.match(activeSql, /BEFORE UPDATE OR DELETE ON public\.trivia_launch_gate_signoffs_v1/);

    // All 5 legacy SQL queries from PHASE-12-LEGACY-RETIREMENT-INVENTORY.md Section 1
    assert.match(activeSql, /FROM public\.trivia_sessions[\s\S]*WHERE engine_version IS NULL[\s\S]*interval '7 days'/);
    assert.match(activeSql, /FROM public\.trivia_pvp_matches[\s\S]*WHERE engine_version IS NULL[\s\S]*interval '7 days'/);
    assert.match(activeSql, /FROM public\.trivia_tournaments[\s\S]*WHERE engine_version IS NULL[\s\S]*interval '7 days'/);
    assert.match(activeSql, /FROM pg_catalog\.pg_stat_user_functions[\s\S]*schemaname = 'public'/);
    assert.match(activeSql, /public\.trivia_ledger_health_v1\(\)/);
    assert.match(activeSql, /FROM public\.trivia_ledger_switches[\s\S]*WHERE key = 'solo_journal'/);

    for (const fnName of LEGACY_OBSERVATION_RPC_NAMES) {
        assert.match(activeSql, new RegExp(`'${fnName}'`), `Migration must track legacy RPC ${fnName}`);
    }

    // All 3 SECURITY DEFINER RPCs with strict search_path and service_role ACLs
    assert.match(activeSql, /CREATE OR REPLACE FUNCTION public\.trivia_legacy_observation_status_v1\(\s*p_record_baseline boolean DEFAULT false\s*\)/s);
    assert.match(activeSql, /CREATE OR REPLACE FUNCTION public\.trivia_record_mfa_write_proof_v1\(/);
    assert.match(activeSql, /CREATE OR REPLACE FUNCTION public\.trivia_launch_readiness_v1\(\)/);
    assert.match(activeSql, /REVOKE ALL ON FUNCTION public\.trivia_legacy_observation_status_v1\(boolean\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(activeSql, /REVOKE ALL ON FUNCTION public\.trivia_record_mfa_write_proof_v1\(uuid, text, uuid, timestamptz\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(activeSql, /REVOKE ALL ON FUNCTION public\.trivia_launch_readiness_v1\(\)\s+FROM PUBLIC, anon, authenticated;/s);
});

test('operationsSnapshot normalizes legacy_observation, launch_readiness, and operator_mfa without degrading healthy ops', () => {
    const emptyLegacy = normalizeLegacyObservation(null);
    assert.equal(emptyLegacy.available, false);
    assert.equal(emptyLegacy.window_satisfied, false);
    assert.equal(emptyLegacy.required_observation_hours, 72);

    const emptyReadiness = normalizeLaunchReadiness(null);
    assert.equal(emptyReadiness.ready_to_unlock_public_card, false);
    assert.equal(emptyReadiness.passed_gates, 0);
    assert.equal(emptyReadiness.total_gates, 4);
    assert.deepEqual(Object.keys(emptyReadiness.gates), [...LAUNCH_READINESS_GATE_KEYS]);

    // Even if an upstream payload claims ready_to_unlock_public_card: true while a gate is open, fail closed!
    const forgedReadiness = normalizeLaunchReadiness({
        generated_at: '2026-11-26T01:10:00.000Z',
        ready_to_unlock_public_card: true,
        passed_gates: 4,
        total_gates: 4,
        gates: {
            burnin_7_nights: { passed: true, status: 'passed', scorecard: '7/7', passed_nights: 7, total_nights: 7, failed_nights: 0, ledger_clean: true },
            operator_mfa_http_write: { passed: true, status: 'passed', signed_at: '2026-11-26T01:00:00.000Z', evidence_ref: 'receipt:abc' },
            legacy_observation_window: { passed: true, status: 'passed', observation_hours: 72.5, required_observation_hours: 72, zero_legacy_traffic: true },
            physical_device_human_review: { passed: true, status: 'passed', ios_signed_at: '2026-11-26T01:00:00.000Z', android_signed_at: null, push_signed_at: null },
        },
    });
    assert.equal(forgedReadiness.gates.physical_device_human_review.passed, false);
    assert.equal(forgedReadiness.passed_gates, 3);
    assert.equal(forgedReadiness.ready_to_unlock_public_card, false);

    // Unverified MFA + pending launch gates NEVER degrade operational healthy status
    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-26T01:10:00.000Z',
        controls: triviaOperationsControls({}),
        operatorContext: { allowed: true, roles: ['observer'], capabilities: ['snapshot'] },
        legacyObservation: {
            generated_at: '2026-11-26T01:10:00.000Z',
            baseline_recorded_at: '2026-11-26T01:05:00.000Z',
            observation_hours: 0.08,
            required_observation_hours: 72,
            legacy_rows: { solo_7d: 0, pvp_7d: 0, tournaments_7d: 0, total_7d: 0 },
            rpc_stats: {},
            rpc_deltas: {},
            total_retired_rpc_delta: 0,
            ledger_clean: true,
            legacy_rows_pending_backfill: 0,
            solo_journal_enabled: true,
            zero_legacy_traffic: true,
            window_satisfied: false,
        },
        launchReadiness: forgedReadiness,
        operatorMfa: normalizeOperatorMfa(null),
    });
    assert.equal(snapshot.healthy, true);
    assert.equal(snapshot.launch_readiness.ready_to_unlock_public_card, false);
    assert.equal(snapshot.legacy_observation.zero_legacy_traffic, true);
    assert.equal(snapshot.legacy_observation.window_satisfied, false);
    assert.equal(snapshot.operator_mfa.verified, false);
    assert.equal(snapshot.operator_mfa.stepUpUrl, '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-operations');
});

test('trivia-operations API wires verifyMfaCookie, legacy observation, launch readiness, and fail-safe MFA write proof', () => {
    const apiSource = read('pages/api/admin/trivia-operations.js');
    assert.match(apiSource, /import\s+\{\s*verifyMfaCookie\s*\}\s+from\s+'\.\.\/\.\.\/\.\.\/src\/lib\/mfaGate'/);
    assert.match(apiSource, /client\.rpc\('trivia_legacy_observation_status_v1',\s*\{\s*p_record_baseline:\s*false\s*\}\)/);
    assert.match(apiSource, /client\.rpc\('trivia_launch_readiness_v1'\)/);
    assert.match(apiSource, /verifyMfaCookie\(req,\s*operator\.user\.id\)/);
    assert.match(apiSource, /client\.rpc\('trivia_record_mfa_write_proof_v1'/);
    assert.match(apiSource, /stepUpUrl:\s*'\/auth\/mfa\?stepup=1&next=%2Fadmin%2Ftrivia-operations'/);
});

test('admin consoles render Phase 12 Launch Gateboard, Legacy Monitor, and requiresMfa step-up UX', () => {
    const opsUi = read('pages/admin/trivia-operations.js');
    assert.match(opsUi, /Phase 12 Launch Certification Gateboard/);
    assert.match(opsUi, /Public Hub Card: Owner-Only Until 4\/4 Gates Pass/);
    assert.match(opsUi, /Legacy-Traffic Observation Window/);
    assert.match(opsUi, /Operator MFA Session/);
    assert.match(opsUi, /Verify MFA Session/);
    assert.match(opsUi, /response\.status === 403 && body\?\.requiresMfa === true/);
    assert.match(opsUi, /data-mfa-stepup-required=/);
    assert.match(opsUi, /\/auth\/mfa\?stepup=1&next=%2Fadmin%2Ftrivia-operations/);

    const poolUi = read('pages/admin/trivia-pool.js');
    assert.match(poolUi, /resp\.status === 403 && payload\?\.requiresMfa === true/);
    assert.match(poolUi, /data-mfa-stepup-required=/);
    assert.match(poolUi, /\/auth\/mfa\?stepup=1&next=%2Fadmin%2Ftrivia-pool/);
    assert.match(poolUi, /Verify MFA Session/);
});

test('verify-legacy-observation CLI script defaults to read-only and supports --record-baseline and --json', () => {
    assert.deepEqual(parseCliArgs([]), { recordBaseline: false, jsonOnly: false });
    assert.deepEqual(parseCliArgs(['--record-baseline', '--json']), { recordBaseline: true, jsonOnly: true });
    assert.equal(buildLegacyObservationSql(false), 'SELECT public.trivia_legacy_observation_status_v1(false) AS payload;');
    assert.equal(buildLegacyObservationSql(true), 'SELECT public.trivia_legacy_observation_status_v1(true) AS payload;');
    const formatted = formatHumanLegacyObservation({
        window_satisfied: false,
        observation_hours: 1.5,
        required_observation_hours: 72,
        baseline_recorded_at: '2026-11-26T01:05:00Z',
        legacy_rows: { solo_7d: 0, pvp_7d: 0, tournaments_7d: 0, total_7d: 0 },
        rpc_stats: { [ACTIVE_UNTIL_FOLDED_RPC]: 5 },
        rpc_deltas: { [ACTIVE_UNTIL_FOLDED_RPC]: 1 },
        total_retired_rpc_delta: 0,
        ledger_clean: true,
        legacy_rows_pending_backfill: 0,
        solo_journal_enabled: true,
        zero_legacy_traffic: true,
    });
    assert.match(formatted, /IN PROGRESS \(1\.5h \/ 72h\)/);
    assert.match(formatted, /active until folded/);
});

test('standing invariant: src/config/ownerOnlyHubCards.js keeps trivia owner-only', () => {
    const ownerOnly = read('src/config/ownerOnlyHubCards.js');
    assert.match(ownerOnly, /'trivia'/);
});
