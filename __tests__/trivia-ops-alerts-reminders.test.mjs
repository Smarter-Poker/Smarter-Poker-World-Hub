/**
 * Wave 2 Track 4 regression & contract guard:
 *  - Migration 20261124173800 (idempotent 7:45 PM CT nightly reminder dispatch
 *    RPC + trailing 24h/7d player funnel & conversion metrics RPC)
 *  - OpenClaw 7:40-7:59 PM CT automated reminder dispatch hook (fail-safe)
 *  - Ops Console snapshot normalizers (integrity_review + player_funnel) proving
 *    non-punitive integrity signals never degrade `healthy: true`
 *  - Admin API wiring and Ops Console UI panels
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    buildTriviaOperationsSnapshot,
    normalizeIntegrityReview,
    normalizePlayerFunnel,
    triviaOperationsControls,
} from '../src/lib/trivia/operationsSnapshot.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('migration 20261124173800 defines idempotent reminder dispatch and funnel RPCs with zero table locks', () => {
    const sql = read('supabase/migrations/20261124173800_trivia_reminder_dispatch_and_funnel_metrics.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema'/);
    const sqlWithoutComments = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '');
    assert.doesNotMatch(sqlWithoutComments, /\bALTER\s+TABLE\b/i, 'additive RPC migration must not lock live tables');
    assert.doesNotMatch(sqlWithoutComments, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);

    // Reminder dispatch RPC contract
    assert.match(
        sql,
        /CREATE OR REPLACE FUNCTION public\.trivia_dispatch_nightly_reminders_v1\(\s*p_tournament_id uuid DEFAULT NULL,\s*p_window_minutes integer DEFAULT 20\s*\)/s,
    );
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    assert.match(sql, /r\.notified_at IS NULL/);
    assert.match(sql, /SET notified_at = v_now/);
    assert.match(sql, /to_regclass\('public\.notifications'\)/);
    assert.match(sql, /FROM public\.profiles AS p WHERE p\.id = v_row\.user_id/);
    assert.match(sql, /INSERT INTO public\.notifications/);
    assert.match(sql, /'dispatched_count'/);
    assert.match(sql, /'skipped_reason'/);

    // Funnel metrics RPC contract
    assert.match(
        sql,
        /CREATE OR REPLACE FUNCTION public\.trivia_player_funnel_metrics_v1\(\s*p_hours integer DEFAULT 24\s*\)/s,
    );
    assert.match(sql, /LEAST\(168,\s*GREATEST\(1,\s*COALESCE\(p_hours,\s*24\)\)\)/);
    for (const metricKey of [
        'solo_sessions_started',
        'solo_sessions_submitted',
        'solo_unique_players',
        'solo_completion_rate_pct',
        'paid_skips_count',
        'pvp_matches_created',
        'pvp_matches_completed',
        'pvp_human_human_count',
        'pvp_human_horse_count',
        'nightly_human_registrations',
        'nightly_reminders_opted_in',
        'integrity_flagged_sessions',
    ]) {
        assert.match(sql, new RegExp(`'${metricKey}'`), `funnel RPC must return ${metricKey}`);
    }

    assert.match(sql, /REVOKE ALL ON FUNCTION public\.trivia_dispatch_nightly_reminders_v1\(uuid, integer\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.trivia_dispatch_nightly_reminders_v1\(uuid, integer\)\s+TO postgres, service_role;/s);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.trivia_player_funnel_metrics_v1\(integer\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.trivia_player_funnel_metrics_v1\(integer\)\s+TO postgres, service_role;/s);
});

test('OpenClaw 7:45 PM CT reminder dispatch fires inside 19:40-19:59 CT window and is fail-safe', () => {
    const pyCode = `
import importlib.util, json, os, sys, types
from datetime import datetime, timezone

calls = []
class FakeResp:
    def __init__(self, code, payload):
        self.status_code = code
        self._payload = payload
    def json(self):
        return self._payload

def fake_post(url, headers=None, json=None, timeout=None):
    calls.append({'url': url, 'json': json, 'timeout': timeout})
    if os.environ.get('FORCE_ERR') == '1':
        raise RuntimeError('simulated network error')
    return FakeResp(200, {'success': True, 'tournament_id': 't-1', 'dispatched_count': 4, 'skipped_reason': None})

for mod in ('requests', 'apscheduler', 'apscheduler.schedulers', 'apscheduler.schedulers.blocking', 'apscheduler.triggers', 'apscheduler.triggers.cron'):
    if mod not in sys.modules:
        m = types.ModuleType(mod)
        m.BlockingScheduler = object
        m.CronTrigger = object
        m.RequestException = Exception
        m.exceptions = types.SimpleNamespace(Timeout=TimeoutError)
        m.post = fake_post
        sys.modules[mod] = m
    elif mod == 'requests':
        sys.modules[mod].post = fake_post

spec = importlib.util.spec_from_file_location('oc', 'scripts/openclaw-cron-dispatcher.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.requests.post = fake_post

# 2026-11-24 is CST (UTC-6): 19:45 CT == 2026-11-25T01:45:00Z
w_before = mod.is_trivia_nightly_reminder_window(datetime(2026, 11, 25, 1, 39, tzinfo=timezone.utc))
w_start  = mod.is_trivia_nightly_reminder_window(datetime(2026, 11, 25, 1, 40, tzinfo=timezone.utc))
w_mid    = mod.is_trivia_nightly_reminder_window(datetime(2026, 11, 25, 1, 45, tzinfo=timezone.utc))
w_end    = mod.is_trivia_nightly_reminder_window(datetime(2026, 11, 25, 1, 59, tzinfo=timezone.utc))
w_after  = mod.is_trivia_nightly_reminder_window(datetime(2026, 11, 25, 2, 0, tzinfo=timezone.utc))

os.environ['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co'
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key-0000000000000000'
os.environ.pop('FORCE_ERR', None)

out_outside = mod._trivia_nightly_reminder_dispatch(datetime(2026, 11, 25, 1, 30, tzinfo=timezone.utc))
out_inside  = mod._trivia_nightly_reminder_dispatch(datetime(2026, 11, 25, 1, 45, tzinfo=timezone.utc))

os.environ['FORCE_ERR'] = '1'
out_error   = mod._trivia_nightly_reminder_dispatch(datetime(2026, 11, 25, 1, 46, tzinfo=timezone.utc))

print(json.dumps({
    'w_before': w_before, 'w_start': w_start, 'w_mid': w_mid, 'w_end': w_end, 'w_after': w_after,
    'out_outside': out_outside, 'out_inside': out_inside, 'out_error': out_error, 'calls': calls,
}))
`;
    const proc = spawnSync('python3', ['-c', pyCode], { cwd: ROOT, encoding: 'utf8', timeout: 15_000 });
    assert.equal(proc.status, 0, `python reminder dispatch test failed: ${proc.stderr}`);
    const result = JSON.parse(proc.stdout.trim().split('\n').at(-1));
    assert.equal(result.w_before, false);
    assert.equal(result.w_start, true);
    assert.equal(result.w_mid, true);
    assert.equal(result.w_end, true);
    assert.equal(result.w_after, false);
    assert.equal(result.out_outside, null);
    assert.equal(result.out_inside.dispatched_count, 4);
    assert.equal(result.out_error, null, 'errors must be caught and never crash tournament scheduler');
    assert.equal(result.calls.length, 2);
    assert.match(result.calls[0].url, /\/rest\/v1\/rpc\/trivia_dispatch_nightly_reminders_v1$/);
    assert.deepEqual(result.calls[0].json, { p_window_minutes: 20 });

    const dispatcherSrc = read('scripts/openclaw-cron-dispatcher.py');
    assert.match(dispatcherSrc, /_trivia_nightly_reminder_dispatch\(\)/);
    assert.match(dispatcherSrc, /\[trivia-nightly-reminders\] non-fatal wrapper error/);
});

test('operationsSnapshot normalizes integrity_review and player_funnel without degrading healthy state', () => {
    const emptyIntegrity = normalizeIntegrityReview(null);
    assert.equal(emptyIntegrity.available, false);
    assert.deepEqual(emptyIntegrity.summary, { total_signals: 0, flagged_signals: 0, high_risk_signals: 0 });
    assert.deepEqual(emptyIntegrity.flagged_sessions, []);

    const emptyFunnel = normalizePlayerFunnel(null);
    assert.equal(emptyFunnel.available, false);
    assert.equal(emptyFunnel.window_hours, 24);
    assert.equal(emptyFunnel.solo_sessions_started, 0);

    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-24T17:45:00.000Z',
        controls: triviaOperationsControls({}),
        questionHealth: { healthy: true, metrics: { eligible_pool: 15000 } },
        tournamentHealth: { healthy: true, alerts: [], upcoming_public_instances: 7 },
        integrityReview: {
            success: true,
            limit: 25,
            summary: {
                total_signals: 42,
                flagged_signals: 3,
                high_risk_signals: 2,
            },
            flagged_sessions: [
                {
                    id: '00000000-0000-4000-8000-000000000101',
                    session_id: '00000000-0000-4000-8000-000000000201',
                    user_id: '00000000-0000-4000-8000-000000000301',
                    display_name: 'FastClickPro',
                    mode: 'daily',
                    tab_blur_count: 5,
                    copy_attempt_count: 2,
                    paste_attempt_count: 1,
                    avg_answer_ms: 920,
                    min_answer_ms: 410,
                    fast_correct_count: 4,
                    accuracy_pct: 90,
                    risk_score: 85,
                    risk_flags: ['excessive_tab_blurs', 'copy_paste_detected', 'inhuman_answer_speed'],
                    created_at: '2026-11-24T17:20:00.000Z',
                },
            ],
            user_aggregates: [],
        },
        playerFunnel: {
            success: true,
            window_hours: 24,
            since: '2026-11-23T17:45:00.000Z',
            solo_sessions_started: 50,
            solo_sessions_submitted: 42,
            solo_unique_players: 19,
            solo_completion_rate_pct: 84.0,
            paid_skips_count: 7,
            pvp_matches_created: 14,
            pvp_matches_completed: 13,
            pvp_human_human_count: 9,
            pvp_human_horse_count: 5,
            nightly_human_registrations: 11,
            nightly_reminders_opted_in: 8,
            nightly_reminders_dispatched: 6,
            integrity_flagged_sessions: 3,
        },
        sourceErrors: {},
    });

    assert.equal(snapshot.healthy, true, 'non-punitive integrity flags must never cause a 503 or unhealthy state');
    assert.deepEqual(snapshot.issues, []);
    assert.equal(snapshot.integrity_review.available, true);
    assert.equal(snapshot.integrity_review.summary.total_signals, 42);
    assert.equal(snapshot.integrity_review.summary.flagged_signals, 3);
    assert.equal(snapshot.integrity_review.summary.high_risk_signals, 2);
    assert.equal(snapshot.integrity_review.flagged_sessions.length, 1);
    assert.equal(snapshot.integrity_review.flagged_sessions[0].risk_score, 85);
    assert.equal(snapshot.integrity_review.flagged_sessions[0].tab_blur_count, 5);
    assert.equal(snapshot.integrity_review.flagged_sessions[0].copy_attempt_count, 2);
    assert.equal(snapshot.integrity_review.flagged_sessions[0].avg_answer_ms, 920);

    assert.equal(snapshot.player_funnel.available, true);
    assert.equal(snapshot.player_funnel.solo_sessions_started, 50);
    assert.equal(snapshot.player_funnel.solo_sessions_submitted, 42);
    assert.equal(snapshot.player_funnel.solo_completion_rate_pct, 84);
    assert.equal(snapshot.player_funnel.paid_skips_count, 7);
    assert.equal(snapshot.player_funnel.pvp_human_human_count, 9);
    assert.equal(snapshot.player_funnel.pvp_human_horse_count, 5);
    assert.equal(snapshot.player_funnel.nightly_human_registrations, 11);
    assert.equal(snapshot.player_funnel.nightly_reminders_opted_in, 8);
    assert.equal(snapshot.player_funnel.integrity_flagged_sessions, 3);
});

test('admin API and Ops Console wire integrity review queue and 24h player funnel panels', () => {
    const api = read('pages/api/admin/trivia-operations.js');
    assert.match(api, /client\.rpc\('trivia_integrity_review_queue_v1',\s*\{\s*p_limit:\s*25\s*\}\)/);
    assert.match(api, /client\.rpc\('trivia_player_funnel_metrics_v1',\s*\{\s*p_hours:\s*24\s*\}\)/);
    assert.match(api, /integrity_review:\s*integrityReviewResult/);
    assert.match(api, /player_funnel:\s*playerFunnelResult/);
    assert.match(api, /integrityReview:\s*integrityReviewResult\.data \|\| null/);
    assert.match(api, /playerFunnel:\s*playerFunnelResult\.data \|\| null/);

    const page = read('pages/admin/trivia-operations.js');
    assert.match(page, /Anti-Cheat Integrity Review Queue/);
    assert.match(page, /24h Player Funnel And Conversion Analytics/);
    assert.match(page, /Total Signals/);
    assert.match(page, /Flagged Sessions/);
    assert.match(page, /High-Risk Signals/);
    assert.match(page, /Risk Score/);
    assert.match(page, /Risk Flags/);
    assert.match(page, /Avg Answer Ms/);
    assert.match(page, /Solo Sessions Started/);
    assert.match(page, /Solo Completion Rate/);
    assert.match(page, /Paid Skips/);
    assert.match(page, /PvP H2H Vs Horse Mix/);
    assert.match(page, /Nightly Human Registrations/);
    assert.match(page, /Nightly Reminder Opt-Ins/);
    assert.doesNotMatch(page, /—|–/, 'UI text must never contain em-dashes or en-dashes');
});
