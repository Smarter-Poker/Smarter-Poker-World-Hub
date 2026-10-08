import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    buildTriviaOperationsSnapshot,
    normalizeCompetitiveCutoverStatus,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('operations release controls are exact, server-only and dependency-aware', () => {
    assert.deepEqual(triviaOperationsControls({}), {
        solo_engine_v3: false,
        free_legacy_fallback: false,
        shadow_selector: true,
        pvp_routes_and_engine: false,
        pvp_horses: false,
        tournament_routes_and_engine: false,
        tournament_horses: false,
    });
    const controls = triviaOperationsControls({
        TRIVIA_P3_SOLO_ENGINE_V3: 'true',
        TRIVIA_FREE_LEGACY_FALLBACK_ENABLED: 'true',
        TRIVIA_P3_SHADOW_SELECTOR: 'false',
        TRIVIA_PVP_ENABLED: 'true',
        TRIVIA_PVP_HORSES_ENABLED: 'true',
        TRIVIA_TOURNAMENTS_ENABLED: 'TRUE',
        TRIVIA_TOURNAMENT_HORSES_ENABLED: 'true',
    });
    assert.equal(controls.solo_engine_v3, true);
    assert.equal(controls.free_legacy_fallback, true);
    assert.equal(controls.shadow_selector, false);
    assert.equal(controls.pvp_routes_and_engine, true);
    assert.equal(controls.pvp_horses, true);
    assert.equal(controls.tournament_routes_and_engine, false, 'loosely truthy values fail closed');
    assert.equal(controls.tournament_horses, false, 'horses cannot bypass their parent release');
});

test('operations snapshot turns domain outcomes and scheduler ownership into one honest state', () => {
    const healthy = buildTriviaOperationsSnapshot({
        generatedAt: '2026-10-05T20:00:00.000Z',
        controls: triviaOperationsControls({}),
        questionHealth: { healthy: true, metrics: { eligible_pool: 20000 } },
        tournamentHealth: { healthy: true, alerts: [], upcoming_public_instances: 7 },
        pvpMetrics: {
            fallback: { horse_before_deadline: 0 },
            join_to_match_ms: { horse_p95: 44_999 },
            settlement_latency_ms: { p95: 9_999 },
            matches: { settlement_failures: 0 },
            ledger_variance: { terminal_matches_with_open_settlement: 0, terminal_escrow_abs_total: 0 },
        },
        schedulerLease: null,
        schedulerRuns: [],
        activeAlerts: [],
        sourceErrors: {},
    });
    assert.equal(healthy.success, true);
    assert.equal(healthy.healthy, true, 'a dormant release does not invent a scheduler incident');

    const releasedLease = buildTriviaOperationsSnapshot({
        generatedAt: '2026-10-05T20:00:00.000Z',
        controls: triviaOperationsControls({ TRIVIA_TOURNAMENTS_ENABLED: 'true' }),
        questionHealth: { healthy: true, metrics: { eligible_pool: 20000 } },
        tournamentHealth: { healthy: true, alerts: [], upcoming_public_instances: 7 },
        schedulerLease: {
            holder_id: 'openclaw:trivia-nightly-tournament',
            expires_at: '2026-10-05T20:05:00.000Z',
            released_at: '2026-10-05T19:59:59.000Z',
        },
        schedulerRuns: [],
        activeAlerts: [],
        sourceErrors: {},
    });
    assert.equal(releasedLease.scheduler.active_owner_observed, false);
    assert.ok(
        releasedLease.issues.some((entry) => entry.code === 'scheduler_owner_absent'),
        'a released lease cannot suppress the missing-owner incident',
    );

    const failed = buildTriviaOperationsSnapshot({
        generatedAt: '2026-10-05T20:00:00.000Z',
        controls: triviaOperationsControls({ TRIVIA_TOURNAMENTS_ENABLED: 'true' }),
        questionHealth: { healthy: false },
        tournamentHealth: { healthy: false },
        pvpMetrics: {
            fallback: { horse_before_deadline: 1 },
            join_to_match_ms: { horse_p95: 45_001 },
            settlement_latency_ms: { p95: 10_000 },
            matches: { settlement_failures: 2 },
            ledger_variance: { terminal_matches_with_open_settlement: 1, terminal_escrow_abs_total: 5 },
        },
        schedulerLease: null,
        schedulerRuns: [
            { outcome: 'owner', finished_at: null },
            { outcome: 'owner', finished_at: null },
        ],
        activeAlerts: [{ episode_key: 'one' }],
        sourceErrors: { pvp_config: 'read_failed' },
    });
    const codes = new Set(failed.issues.map((entry) => entry.code));
    for (const code of [
        'source_unavailable:pvp_config',
        'question_domain_unhealthy',
        'tournament_domain_unhealthy',
        'pvp_horse_before_deadline',
        'pvp_fallback_p95_slow',
        'pvp_settlement_p95_slow',
        'pvp_terminal_ledger_variance',
        'pvp_settlement_failures',
        'question_alert_episodes_active',
        'scheduler_owner_absent',
        'scheduler_duplicate_owner_runs',
    ]) assert.ok(codes.has(code), `${code} must be visible`);
    assert.equal(failed.success, false);
    assert.equal(failed.healthy, false);
});

test('historical quarantine leaves the API only as non-identifying aggregates', () => {
    const snapshot = buildTriviaOperationsSnapshot({
        quarantineRows: [
            { entity_type: 'trivia_tournament', entity_id: 'secret-a', reason_code: 'legacy_8_horse_184_pool_unsettled', invariant_snapshot: { player: 'secret' } },
            { entity_type: 'trivia_pvp_match', entity_id: 'secret-b', reason_code: 'legacy_abandoned_human_horse_refund_incident' },
        ],
        questionQuarantineRows: [
            { question_id: 'secret-q', reason_code: 'duplicate', source: 'duplicate_conflict' },
        ],
    });
    assert.deepEqual(snapshot.historical_quarantine, {
        total: 2,
        by_reason: {
            'trivia_tournament:legacy_8_horse_184_pool_unsettled': 1,
            'trivia_pvp_match:legacy_abandoned_human_horse_refund_incident': 1,
        },
    });
    assert.deepEqual(snapshot.question_quarantine, {
        active: 1,
        by_reason: { duplicate: 1 },
        by_source: { duplicate_conflict: 1 },
    });
    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /secret-a|secret-b|secret-q|invariant_snapshot/);
});

test('operations health exposes all durable cutover gates and makes release drift unhealthy', () => {
    const gate = (enabled) => ({
        enabled,
        version: 1,
        certificate_id: `00000000-0000-4000-8000-00000000000${enabled ? 1 : 0}`,
        created_at: '2026-10-05T20:00:00.000Z',
    });
    const blocked = {
        version: 1,
        gates: {
            pvp_public: gate(false),
            pvp_horses: gate(false),
            tournament_public: gate(false),
            tournament_horses: gate(false),
            tournament_scheduler: gate(false),
        },
        named_test_wallet_count: 0,
        ledger_clean: true,
        treasury: { balance: 0, floor: 0, available: 0 },
    };
    assert.equal(Object.keys(normalizeCompetitiveCutoverStatus(blocked).gates).length, 5);
    const envDrift = buildTriviaOperationsSnapshot({
        controls: triviaOperationsControls({
            TRIVIA_PVP_ENABLED: 'true',
            TRIVIA_PVP_HORSES_ENABLED: 'true',
            TRIVIA_TOURNAMENTS_ENABLED: 'true',
            TRIVIA_TOURNAMENT_HORSES_ENABLED: 'true',
        }),
        pvpConfig: { joins_enabled: true, horses_enabled: true },
        cutoverStatus: blocked,
    });
    const driftCodes = new Set(envDrift.issues.map((item) => item.code));
    for (const code of [
        'cutover_pvp_public_mismatch',
        'cutover_pvp_horses_mismatch',
        'cutover_tournament_public_mismatch',
        'cutover_tournament_horses_mismatch',
        'cutover_tournament_scheduler_mismatch',
    ]) assert.ok(driftCodes.has(code), `${code} must be unhealthy`);
    assert.equal(envDrift.healthy, false);

    const canaryStage = buildTriviaOperationsSnapshot({
        controls: triviaOperationsControls({}),
        pvpConfig: { joins_enabled: true, horses_enabled: true },
        cutoverStatus: blocked,
    });
    assert.equal(canaryStage.issues.some((item) => item.code.startsWith('cutover_pvp_')), false,
        'database engine switches support named-wallet canaries and are not public release signals');

    const orphanHorses = structuredClone(blocked);
    orphanHorses.gates.pvp_horses = gate(true);
    orphanHorses.gates.tournament_horses = gate(true);
    const parentDrift = buildTriviaOperationsSnapshot({
        controls: triviaOperationsControls({}),
        pvpConfig: { joins_enabled: false, horses_enabled: false },
        cutoverStatus: orphanHorses,
    });
    const parentCodes = new Set(parentDrift.issues.map((item) => item.code));
    assert.ok(parentCodes.has('cutover_pvp_horse_parent_disabled'));
    assert.ok(parentCodes.has('cutover_tournament_horse_parent_disabled'));
});

test('cutover status sanitizes financial readiness and the latest PvP recovery receipt', () => {
    const normalized = normalizeCompetitiveCutoverStatus({
        version: 1,
        gates: Object.fromEntries([
            'pvp_public',
            'pvp_horses',
            'tournament_public',
            'tournament_horses',
            'tournament_scheduler',
        ].map((key) => [key, {
            enabled: false,
            version: 1,
            certificate_id: `certificate:${key}`,
            created_at: '2026-10-05T20:00:00.000Z',
        }])),
        named_test_wallet_count: 2,
        ledger_clean: true,
        treasury: { account: 'treasury:trivia', balance: 1800, floor: 400, available: 1400 },
        recovery_status: {
            run_id: '00000000-0000-4000-8000-000000000321',
            outcome: 'owner',
            started_at: '2026-10-05T20:00:00.000Z',
            finished_at: '2026-10-05T20:00:02.000Z',
            healthy: true,
            success: true,
            tickets_expired: 3,
            matches_scanned: 4,
            settled: 2,
            pending: 2,
            failed: 0,
            holder_id: 'must-not-cross-api-boundary',
            fencing_token: 44,
            result: { detail: 'must-not-cross-api-boundary' },
            sqlstate: 'must-not-cross-api-boundary',
        },
    });
    assert.deepEqual(normalized.treasury, {
        account: 'treasury:trivia',
        balance: 1800,
        floor: 400,
        available: 1400,
    });
    assert.deepEqual(normalized.recovery_status, {
        run_id: '00000000-0000-4000-8000-000000000321',
        outcome: 'owner',
        started_at: '2026-10-05T20:00:00.000Z',
        finished_at: '2026-10-05T20:00:02.000Z',
        healthy: true,
        success: true,
        tickets_expired: 3,
        matches_scanned: 4,
        settled: 2,
        pending: 2,
        failed: 0,
    });
    assert.doesNotMatch(JSON.stringify(normalized), /must-not-cross-api-boundary|fencing_token|holder_id|sqlstate/);
});

test('an unclean ledger or unhealthy latest recovery is a critical operations issue', () => {
    const gate = {
        enabled: false,
        version: 1,
        certificate_id: '00000000-0000-4000-8000-000000000111',
        created_at: '2026-10-05T20:00:00.000Z',
    };
    const snapshot = buildTriviaOperationsSnapshot({
        controls: triviaOperationsControls({}),
        cutoverStatus: {
            version: 1,
            gates: {
                pvp_public: gate,
                pvp_horses: gate,
                tournament_public: gate,
                tournament_horses: gate,
                tournament_scheduler: gate,
            },
            ledger_clean: false,
            treasury: { account: 'treasury:trivia', balance: 0, floor: 0, available: 0 },
            recovery_status: {
                run_id: '00000000-0000-4000-8000-000000000222',
                outcome: 'owner',
                started_at: '2026-10-05T20:00:00.000Z',
                finished_at: '2026-10-05T20:00:03.000Z',
                healthy: false,
                success: false,
                tickets_expired: 0,
                matches_scanned: 1,
                settled: 0,
                pending: 0,
                failed: 1,
            },
        },
    });
    const issues = new Map(snapshot.issues.map((item) => [item.code, item]));
    assert.equal(issues.get('cutover_ledger_unhealthy')?.severity, 'critical');
    assert.equal(issues.get('cutover_pvp_recovery_unhealthy')?.severity, 'critical');
    assert.equal(snapshot.healthy, false);

    const dormant = buildTriviaOperationsSnapshot({
        controls: triviaOperationsControls({}),
        cutoverStatus: {
            version: 1,
            gates: {
                pvp_public: gate,
                pvp_horses: gate,
                tournament_public: gate,
                tournament_horses: gate,
                tournament_scheduler: gate,
            },
            ledger_clean: true,
            treasury: { account: 'treasury:trivia', balance: 0, floor: 0, available: 0 },
            recovery_status: null,
        },
    });
    assert.equal(dormant.issues.some((item) => item.code === 'cutover_pvp_recovery_unhealthy'), false,
        'no recovery receipt while the job is intentionally dormant is not a fabricated failure');
});

test('the unified operations route is least-privilege, receipt-backed and domain-aware', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(api, /from '\.\.\/\.\.\/\.\.\/src\/lib\/supabaseServerClient'/, 'server wrapper is mandatory');
    assert.doesNotMatch(api, /from ['"]@supabase\/supabase-js['"]/);
    assert.match(api, /getServerUserWithFallback/);
    assert.match(api, /trivia_operator_context_v1/);
    assert.match(api, /trivia_operator_required/);
    assert.match(api, /trivia_question_health_v1/);
    assert.match(api, /trivia_pvp_metrics_v2/);
    assert.match(api, /trivia_tournament_health_v1/);
    assert.match(api, /trivia_operations_health_v1/);
    assert.match(api, /trivia_competitive_cutover_status_v1/);
    assert.match(api, /trivia_operator_execute_v1/);
    assert.match(api, /trivia_tournament_scheduler_leases/);
    assert.match(api, /competitive_quarantine/);
    assert.match(api, /res\.status\(snapshot\.healthy \? 200 : 503\)/, 'HTTP outcome cannot stay green when the domain is red');
    assert.doesNotMatch(api, /invariant_snapshot|player1_id|player2_id/);
    assert.doesNotMatch(api, /requireAdminSecret|ADMIN_ROLES/);
});

test('the operations page fetches the restricted projection and retains exact retry identity', () => {
    const page = read('pages/admin/trivia-operations.js');
    assert.match(page, /fetch\(`\/api\/admin\/trivia-operations/);
    assert.match(page, /Authorization: `Bearer \$\{token\}`/);
    assert.match(page, /Restricted Operator Authority/);
    assert.match(page, /method:\s*'POST'/);
    assert.match(page, /Retry Same Request/);
    assert.match(page, /Payout Hold Unavailable/);
    assert.match(page, /Durable database cutover authority/);
    for (const gate of ['pvp_public', 'pvp_horses', 'tournament_public', 'tournament_horses', 'tournament_scheduler']) {
        assert.match(page, new RegExp(gate));
    }
    for (const label of ['Ledger clean', 'Treasury balance', 'Treasury floor', 'Treasury available', 'Latest PvP recovery']) {
        assert.match(page, new RegExp(label));
    }
    assert.doesNotMatch(page, /@supabase\/supabase-js|SUPABASE_SERVICE_ROLE_KEY/);
});

test('the accessibility pass covers 1920px and fails when its own summary is non-empty', () => {
    const pass = read('scripts/trivia-ui/a11y-pass.mjs');
    assert.match(pass, /name: '1920', width: 1920, height: 1080/);
    assert.match(pass, /if \(bad\.length > 0\) process\.exitCode = 1/);
});
