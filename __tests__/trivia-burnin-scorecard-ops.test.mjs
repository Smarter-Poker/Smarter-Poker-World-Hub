/**
 * Wave 3 Track 2 regression & contract guard:
 *  - Additive read-only DB RPC migration
 *    `supabase/migrations/20261125024600_trivia_nightly_burnin_scorecard_rpc.sql`
 *  - `operationsSnapshot.mjs` `normalizeBurnInScorecard` & `burnin_scorecard`
 *    normalization (proving informational burn-in never turns healthy ops 503)
 *  - Admin API `pages/api/admin/trivia-operations.js` parallel RPC wiring
 *  - Ops Console `pages/admin/trivia-operations.js` 7-Night Launch Burn-In
 *    Scorecard panel & visual-system compliance
 *  - CLI parity helpers in `scripts/trivia/verify-nightly-burnin.mjs`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    BURNIN_SLO_KEYS,
    buildTriviaOperationsSnapshot,
    normalizeBurnInScorecard,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';
import {
    buildRpcBurnInSql,
    compareBurnInScorecards,
    expectedBurnInDates,
    gradeNightlyBurnIn,
    parseCliArgs,
} from '../scripts/trivia/verify-nightly-burnin.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('migration 20261125024600 defines read-only burn-in scorecard RPC with strict ACLs and zero table locks', () => {
    const sql = read('supabase/migrations/20261125024600_trivia_nightly_burnin_scorecard_rpc.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);

    const activeSql = sql.split('/* FORWARD ROLLBACK')[0]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '');
    assert.doesNotMatch(activeSql, /\bALTER\s+TABLE\b/i, 'read-only RPC migration must never lock tables');
    assert.doesNotMatch(activeSql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i, 'scorecard RPC must be strictly read-only');
    assert.doesNotMatch(activeSql, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);

    assert.match(
        activeSql,
        /CREATE OR REPLACE FUNCTION public\.trivia_nightly_burnin_scorecard_v1\(\s*p_start_date date DEFAULT DATE '2026-11-24',\s*p_days integer DEFAULT 7\s*\)/s,
    );
    assert.match(activeSql, /\bSTABLE\b/);
    assert.match(activeSql, /\bSECURITY DEFINER\b/);
    assert.match(activeSql, /SET search_path TO ''/);
    assert.match(activeSql, /public\.trivia_tournament_metrics_v1/);
    assert.match(activeSql, /public\.trivia_ledger_recon_tournament/);
    assert.match(activeSql, /public\.trivia_competitive_global_ledger_clean_v1\(\)/);
    assert.match(activeSql, /m\.schedule_kind = 'public_nightly'/);
    assert.doesNotMatch(
        activeSql,
        /held_total[^;\n]*subsidy_total/i,
        'scorecard RPC must never double-count subsidy_total on top of held_total',
    );

    for (const sloKey of BURNIN_SLO_KEYS) {
        assert.match(activeSql, new RegExp(`'${sloKey}'`), `RPC must grade SLO ${sloKey}`);
    }

    assert.match(
        activeSql,
        /REVOKE ALL ON FUNCTION public\.trivia_nightly_burnin_scorecard_v1\(date, integer\)\s+FROM PUBLIC, anon, authenticated;/s,
    );
    assert.match(
        activeSql,
        /GRANT EXECUTE ON FUNCTION public\.trivia_nightly_burnin_scorecard_v1\(date, integer\)\s+TO postgres, service_role;/s,
    );
    assert.match(activeSql, /ARRAY\['postgres=X\/postgres', 'service_role=X\/postgres'\]/);
});

test('operationsSnapshot normalizes burnin_scorecard and keeps healthy true while burn-in is in progress', () => {
    const empty = normalizeBurnInScorecard(null);
    assert.equal(empty.available, false);
    assert.equal(empty.scorecard, '0/7');
    assert.equal(empty.certified, false);
    assert.deepEqual(empty.nights, []);

    const pendingPayload = {
        contract: 'trivia-phase12-burnin/1',
        generated_at: '2026-11-25T02:05:00.000Z',
        window: { start_date: '2026-11-24', end_date: '2026-11-30', days: 7 },
        scorecard: '1/7',
        certified: false,
        passed: 1,
        failed: 0,
        pending: 6,
        scheduled: 7,
        total: 7,
        ledger_clean: true,
        nights: [
            {
                date: '2026-11-24',
                tournament_id: '41b958e0-655b-46fa-97d5-4f92c8b80874',
                start_time: '2026-11-25T02:00:00.000Z',
                lifecycle_state: 'settled',
                horse_target: 100,
                horses_entered: 100,
                humans_entered: 14,
                start_delay_seconds: 8,
                event_duration_seconds: 2100,
                event_budget_seconds: 3600,
                stuck_rounds: 0,
                settlement_state: 'settled',
                settlement_latency_seconds: 12,
                settlement_sla_seconds: 60,
                charged_entrants: 114,
                excluded_charged_entrants: 0,
                escrow_balance: 0,
                ledger_variance: 0,
                status: 'passed',
                slos: Object.fromEntries(BURNIN_SLO_KEYS.map((k) => [k, { passed: true, detail: 'ok' }])),
            },
            {
                date: '2026-11-25',
                tournament_id: '00000000-0000-4000-8000-000000000002',
                start_time: '2026-11-26T02:00:00.000Z',
                lifecycle_state: 'scheduled',
                horse_target: 105,
                horses_entered: 0,
                humans_entered: 3,
                start_delay_seconds: null,
                event_duration_seconds: null,
                event_budget_seconds: 3600,
                stuck_rounds: 0,
                settlement_state: null,
                settlement_latency_seconds: null,
                settlement_sla_seconds: 60,
                charged_entrants: 3,
                excluded_charged_entrants: 3,
                escrow_balance: 0,
                ledger_variance: 0,
                status: 'pending',
                slos: Object.fromEntries(BURNIN_SLO_KEYS.map((k) => [k, { passed: false, detail: 'pending' }])),
            },
        ],
    };

    const normalized = normalizeBurnInScorecard(pendingPayload);
    assert.equal(normalized.available, true);
    assert.equal(normalized.scorecard, '1/7');
    assert.equal(normalized.certified, false);
    assert.equal(normalized.passed, 1);
    assert.equal(normalized.pending, 6);
    assert.equal(normalized.failed, 0);
    assert.equal(normalized.ledger_clean, true);
    assert.equal(normalized.nights.length, 2);
    assert.equal(normalized.nights[0].slos_passed, 6);
    assert.equal(normalized.nights[1].status, 'pending');

    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-25T03:00:00.000Z',
        controls: triviaOperationsControls({}),
        operatorContext: {
            allowed: true,
            roles: ['observer'],
            capabilities: ['snapshot'],
        },
        burnInScorecard: pendingPayload,
    });
    assert.equal(snapshot.healthy, true, 'in-progress 1/7 burn-in scorecard must never degrade ops health');
    assert.deepEqual(snapshot.issues, []);
    assert.equal(snapshot.burnin_scorecard.scorecard, '1/7');
    assert.equal(snapshot.burnin_scorecard.certified, false);

    // Even 0/7 pending keeps ops HTTP 200 healthy
    const zeroOfSeven = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-25T01:55:00.000Z',
        controls: triviaOperationsControls({}),
        operatorContext: { allowed: true, roles: ['observer'], capabilities: ['snapshot'] },
        burnInScorecard: { ...pendingPayload, scorecard: '0/7', passed: 0, pending: 7 },
    });
    assert.equal(zeroOfSeven.healthy, true);
    assert.equal(zeroOfSeven.burnin_scorecard.scorecard, '0/7');

    // Certified 7/7 requires passed === 7 && failed === 0 && ledger_clean === true
    const certified = normalizeBurnInScorecard({
        ...pendingPayload,
        scorecard: '7/7',
        passed: 7,
        pending: 0,
        failed: 0,
        ledger_clean: true,
    });
    assert.equal(certified.certified, true);
    assert.equal(certified.scorecard, '7/7');

    const uncertifiedDirtyLedger = normalizeBurnInScorecard({
        ...pendingPayload,
        scorecard: '7/7',
        passed: 7,
        pending: 0,
        failed: 0,
        ledger_clean: false,
    });
    assert.equal(uncertifiedDirtyLedger.certified, false);
});

test('admin API and Ops Console page wire trivia_nightly_burnin_scorecard_v1 and render the 7-Night Scorecard panel cleanly', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(
        api,
        /client\.rpc\('trivia_nightly_burnin_scorecard_v1',\s*\{\s*p_start_date:\s*'2026-11-24',\s*p_days:\s*7\s*\}\)/,
    );
    assert.match(api, /burnin_scorecard:\s*burnInScorecardResult/);
    assert.match(api, /burnInScorecard:\s*burnInScorecardResult\.data \|\| null/);

    const page = read('pages/admin/trivia-operations.js');
    assert.match(page, /7-Night Launch Burn-In Scorecard/);
    assert.match(page, /aria-label="7-Night Launch Burn-In Scorecard"/);
    assert.match(page, /data\.burnin_scorecard/);
    assert.match(page, /CERTIFIED/);
    assert.match(page, /IN PROGRESS/);
    assert.match(page, /Ledger Clean/);
    assert.match(page, /Horse Fill/);
    assert.match(page, /Start Delay/);
    assert.match(page, /Settlement/);
    assert.match(page, /Escrow \/ Variance/);
    assert.match(page, /Phase 12 SLOs/);
    assert.doesNotMatch(page, /—|–/, 'UI text must never contain em-dashes or en-dashes');
    assert.doesNotMatch(page, /[↻✓✗◆]/u, 'admin surface must avoid retired symbol icons');
    assert.doesNotMatch(page, /[\u{1F300}-\u{1FAFF}]/u, 'admin surface must not include emojis');
});

test('verify-nightly-burnin CLI preserves existing flags and provides exact RPC parity cross-check', () => {
    const parsedDefault = parseCliArgs([]);
    assert.deepEqual(parsedDefault, {
        startDate: '2026-11-24',
        days: 7,
        jsonOnly: false,
        verifyRpc: false,
    });
    const parsedRpc = parseCliArgs(['--json', '--rpc', '--start=2026-11-24', '--days=7']);
    assert.deepEqual(parsedRpc, {
        startDate: '2026-11-24',
        days: 7,
        jsonOnly: true,
        verifyRpc: true,
    });

    assert.equal(
        buildRpcBurnInSql('2026-11-24', 7),
        "SELECT public.trivia_nightly_burnin_scorecard_v1('2026-11-24'::date, 7) AS payload;",
    );
    assert.throws(() => buildRpcBurnInSql('not-a-date', 7));
    assert.throws(() => buildRpcBurnInSql('2026-11-24', 99));

    const dates = expectedBurnInDates('2026-11-24', 7);
    const rows = dates.map((date, idx) => ({
        tournament_id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
        scheduled_local_date: date,
        start_time: `${date}T02:00:00.000Z`,
        lifecycle_state: idx === 0 ? 'settled' : 'scheduled',
        horse_target: 100,
        horses_entered: idx === 0 ? 100 : 0,
        humans_entered: 8,
        start_delay_seconds: idx === 0 ? 10 : null,
        charged_entrants: idx === 0 ? 108 : 8,
        excluded_charged_entrants: idx === 0 ? 0 : 8,
        event_duration_seconds: idx === 0 ? 1900 : null,
        event_budget_seconds: 3600,
        stuck_rounds: 0,
        settlement_state: idx === 0 ? 'settled' : null,
        settlement_latency_seconds: idx === 0 ? 15 : null,
        settlement_sla_seconds: 60,
        escrow_balance: 0,
        ledger_variance: 0,
    }));

    const cliReport = gradeNightlyBurnIn(rows, {
        startDate: '2026-11-24',
        days: 7,
        nowIso: '2026-11-25T03:00:00.000Z',
        ledgerHealth: { healthy: true, exception_count: 0 },
    });
    const rpcReport = structuredClone(cliReport);
    rpcReport.passed = cliReport.summary.passed;
    rpcReport.failed = cliReport.summary.failed;
    rpcReport.pending = cliReport.summary.pending;
    rpcReport.ledger_clean = cliReport.summary.ledger_clean;

    const matched = compareBurnInScorecards(cliReport, rpcReport);
    assert.equal(matched.match, true);
    assert.deepEqual(matched.mismatches, []);

    const drifted = structuredClone(rpcReport);
    drifted.scorecard = '0/7';
    drifted.summary.passed = 0;
    drifted.nights[0].status = 'failed';
    drifted.nights[0].slos.horse_target_exact.passed = false;

    const mismatch = compareBurnInScorecards(cliReport, drifted);
    assert.equal(mismatch.match, false);
    assert.ok(mismatch.mismatches.some((m) => m.includes('scorecard mismatch')));
    assert.ok(mismatch.mismatches.some((m) => m.includes('horse_target_exact.passed mismatch')));

    const cliSource = read('scripts/trivia/verify-nightly-burnin.mjs');
    assert.match(cliSource, /FROM public\.trivia_ledger_recon_tournament/);
    assert.doesNotMatch(
        cliSource,
        /held_total[^;\n]*subsidy_total/i,
        'CLI burn-in SQL must read unexplained_variance from trivia_ledger_recon_tournament without double-counting subsidy_total',
    );
});

test('NightlySpectatorBanner formats 0-based DB matchup.slot into 1-based Semifinal and Round Match labels', () => {
    const src = read('src/components/trivia/NightlySpectatorBanner.jsx');
    const fnMatch = src.match(/export function matchupStageLabel\([\s\S]*?\n\}/);
    assert.ok(fnMatch, 'NightlySpectatorBanner must export matchupStageLabel');
    assert.doesNotMatch(
        fnMatch[0],
        /Number\(matchup\?\.slot \|\| 1\)/,
        '0-based slot 0 must not collapse onto slot 1',
    );
    const matchupStageLabel = new Function(
        'matchup',
        'totalRounds',
        'semiRound',
        'finalRound',
        fnMatch[0].replace(/^export function matchupStageLabel\([^)]*\)\s*\{/, '').replace(/\}$/, ''),
    );

    assert.equal(matchupStageLabel({ roundNumber: 6, slot: 0 }, 7, 6, 7), 'Semifinal 1');
    assert.equal(matchupStageLabel({ roundNumber: 6, slot: 1 }, 7, 6, 7), 'Semifinal 2');
    assert.equal(matchupStageLabel({ roundNumber: 7, slot: 0 }, 7, 6, 7), 'Championship Final');
    assert.equal(matchupStageLabel({ roundNumber: 1, slot: 0 }, 7, 6, 7), 'Round 1 Match 1');
    assert.equal(matchupStageLabel({ roundNumber: 1, slot: 1 }, 7, 6, 7), 'Round 1 Match 2');
    assert.equal(matchupStageLabel({ roundNumber: 6, slot: null }, 7, 6, 7), 'Semifinal 1');
});
