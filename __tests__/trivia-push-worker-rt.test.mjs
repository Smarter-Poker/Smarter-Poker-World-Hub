/**
 * Wave 3 Track 1 regression & contract guard:
 *  - Migration 20261125024500_trivia_reminder_push_outbox.sql (predecessor MD5,
 *    durable push_outbox handoff, _push double-enqueue prevention, idempotency,
 *    distinct notification/handoff/device-receipt tracking, forward rollback)
 *  - World Hub push-prefs & push-dispatch registration for trivia_nightly_reminder
 *  - OpenClaw sanitized Realtime broadcast emitter & nightly transition detector
 *    (zero answer keys / PII, 1.5s timeout, fail-safe, channel trivia:tournament:<id>)
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { eventToTypeKey, isUrgentType } from '../src/lib/push/push-prefs.js';
import { gateDecision } from '../src/lib/push/push-gate.js';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('migration 20261125024500 enforces predecessor MD5, idempotent push_outbox handoff, and rollback', () => {
    const sql = read('supabase/migrations/20261125024500_trivia_reminder_push_outbox.sql');
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema'/);

    const activeSql = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '');

    // Exact predecessor MD5 guard for Wave 2 Track 4 trivia_dispatch_nightly_reminders_v1
    assert.match(activeSql, /bffa804238d695ad9e4e49d5f1a1464c/);
    assert.match(activeSql, /Predecessor MD5 mismatch/);

    // Must never ALTER any existing live table (only additive receipt table with RLS)
    assert.doesNotMatch(activeSql, /ALTER\s+TABLE\s+public\.(push_outbox|notifications|trivia_nightly_reminders|profiles|tournaments)/i);
    assert.doesNotMatch(activeSql, /REFERENCES\s+public\.push_outbox/i, 'must not acquire FK SHARE ROW EXCLUSIVE lock on hot push_outbox');
    assert.doesNotMatch(activeSql, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);

    // Durable RLS-locked push handoff receipt ledger
    assert.match(activeSql, /CREATE TABLE IF NOT EXISTS public\.trivia_nightly_reminder_push_receipts/);
    assert.match(activeSql, /ALTER TABLE public\.trivia_nightly_reminder_push_receipts ENABLE ROW LEVEL SECURITY;/);
    assert.match(activeSql, /REVOKE ALL ON TABLE public\.trivia_nightly_reminder_push_receipts FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(activeSql, /UNIQUE \(user_id, tournament_id\)/);
    assert.match(activeSql, /UNIQUE \(push_tag\)/);

    // Explicit _push sentinel prevents trg_mirror_notification_to_push_outbox double enqueue
    assert.match(activeSql, /'_push',\s*CASE WHEN v_wants_push THEN 'outbox_rpc' ELSE 'none' END/);

    // Deterministic idempotent push_outbox insert + active subscription check + distinct receipt reporting
    assert.match(activeSql, /v_push_tag := 'trivia_nightly_reminder:' \|\| v_tournament\.id::text \|\| ':' \|\| v_row\.user_id::text;/);
    assert.match(activeSql, /FROM public\.push_outbox AS o/);
    assert.match(activeSql, /FROM public\.push_subscriptions AS s/);
    assert.match(activeSql, /INSERT INTO public\.push_outbox/);
    assert.match(activeSql, /'push_handoff_count'/);
    assert.match(activeSql, /'push_outbox_status'/);
    assert.match(activeSql, /'physical_device_receipt_confirmed',\s*false/);
    assert.match(activeSql, /REVOKE ALL ON FUNCTION public\.trivia_dispatch_nightly_reminders_v1\(uuid, integer\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(activeSql, /GRANT EXECUTE ON FUNCTION public\.trivia_dispatch_nightly_reminders_v1\(uuid, integer\)\s+TO postgres, service_role;/s);
});

test('trivia_nightly_reminder is registered in push-prefs and push-dispatch with urgent consent and 20m TTL', () => {
    assert.equal(eventToTypeKey('trivia_nightly_reminder'), 'tournament_starting');
    assert.equal(isUrgentType(eventToTypeKey('trivia_nightly_reminder')), true);

    // Explicit user opt-out via tournament_starting toggle must suppress
    const blockedNew = gateDecision(
        { prefs: { push_enabled: true, push_type_prefs: { tournament_starting: false } }, legacy: null },
        'trivia_nightly_reminder',
    );
    assert.equal(blockedNew.allowed, false);
    assert.equal(blockedNew.reason, 'type_disabled:tournament_starting');

    // Explicit legacy opt-out via tournament_reminders must suppress
    const blockedLegacy = gateDecision(
        { prefs: null, legacy: { tournament_reminders: false } },
        'trivia_nightly_reminder',
    );
    assert.equal(blockedLegacy.allowed, false);
    assert.equal(blockedLegacy.reason, 'legacy_disabled:tournament_starting');

    // Opted-in player pierces quiet hours & daily cap because tournament_starting is urgent
    const allowedUrgent = gateDecision(
        {
            prefs: {
                push_enabled: true,
                mute_all: false,
                quiet_hours_start: 18,
                quiet_hours_end: 8,
                quiet_hours_tz: 'America/Chicago',
                daily_push_cap: 1,
            },
            legacy: { tournament_reminders: true },
        },
        'trivia_nightly_reminder',
        { now: new Date('2026-11-25T01:45:00Z'), sentToday: 5 },
    );
    assert.equal(allowedUrgent.allowed, true);

    const dispatchSrc = read('pages/api/cron/push-dispatch.js');
    assert.match(dispatchSrc, /trivia_nightly_reminder:\s*'trivia nightly reminders'/);
    assert.match(dispatchSrc, /trivia_nightly_reminder:\s*20 \* 60/);
});

test('OpenClaw Realtime broadcast helper sanitizes payloads, enforces 1.5s timeout, and detects transitions fail-safely', () => {
    const pyCode = `
import importlib.util, json, os, sys, types
from datetime import datetime, timezone

post_calls = []
get_calls = []
db_rows_queue = []

class FakeResp:
    def __init__(self, code, payload=None, text=''):
        self.status_code = code
        self._payload = payload
        self.text = text
    def json(self):
        return self._payload

def fake_post(url, headers=None, json=None, timeout=None):
    post_calls.append({'url': url, 'headers': headers, 'json': json, 'timeout': timeout})
    mode = os.environ.get('POST_MODE', 'ok')
    if mode == 'timeout':
        raise TimeoutError('simulated 1.5s timeout')
    if mode == 'http500':
        return FakeResp(500, {'error': 'down'})
    if url.endswith('/rest/v1/rpc/trivia_dispatch_nightly_reminders_v1'):
        return FakeResp(200, {
            'success': True,
            'tournament_id': '41b958e0-655b-46fa-97d5-4f92c8b80874',
            'dispatched_count': 3,
            'in_app_notifications_created': 3,
            'push_handoff_count': 2,
            'push_outbox_status': 'partial_enqueued',
            'physical_device_receipt_confirmed': False,
            'skipped_reason': None,
        })
    return FakeResp(202, {'ok': True})

def fake_get(url, params=None, headers=None, timeout=None):
    get_calls.append({'url': url, 'params': params, 'timeout': timeout})
    if os.environ.get('GET_MODE') == 'error':
        raise RuntimeError('simulated db read error')
    rows = db_rows_queue.pop(0) if db_rows_queue else []
    return FakeResp(200, rows)

for mname in ('requests', 'apscheduler', 'apscheduler.schedulers', 'apscheduler.schedulers.blocking', 'apscheduler.triggers', 'apscheduler.triggers.cron'):
    if mname not in sys.modules:
        m = types.ModuleType(mname)
        m.BlockingScheduler = object
        m.CronTrigger = object
        m.RequestException = Exception
        m.exceptions = types.SimpleNamespace(Timeout=TimeoutError)
        m.post = fake_post
        m.get = fake_get
        sys.modules[mname] = m
    elif mname == 'requests':
        sys.modules[mname].post = fake_post
        sys.modules[mname].get = fake_get

spec = importlib.util.spec_from_file_location('oc_rt', 'scripts/openclaw-cron-dispatcher.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.requests.post = fake_post
mod.requests.get = fake_get

os.environ['NEXT_PUBLIC_SUPABASE_URL'] = 'https://example.supabase.co'
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-role-key-0000000000000000'
os.environ['POST_MODE'] = 'ok'
os.environ.pop('GET_MODE', None)

tid = '41b958e0-655b-46fa-97d5-4f92c8b80874'

# 1. Sanitizer accepts clean payload and rejects forbidden answer/PII keys & malformed IDs
clean = mod._sanitize_trivia_realtime_payload(tid, 'live', 2, 'round_update')
bad_tid = mod._sanitize_trivia_realtime_payload('../bad topic', 'live', 2, 'round_update')
bad_extra_answer = mod._sanitize_trivia_realtime_payload(tid, 'live', 2, 'round_update', extra={'nested': {'correct_index': 1}})
bad_extra_pii = mod._sanitize_trivia_realtime_payload(tid, 'live', 2, 'round_update', extra={'email': 'player@example.com'})
bad_round_bool = mod._sanitize_trivia_realtime_payload(tid, 'live', True, 'round_update')

# 2. Direct broadcast emit posts to /realtime/v1/api/broadcast with 1.5s timeout
emit_ok = mod._emit_trivia_tournament_realtime_broadcast(tid, 'live', 3, 'round_update')

# 3. Timeout & HTTP 500 never raise (fail-safe)
os.environ['POST_MODE'] = 'timeout'
emit_timeout = mod._emit_trivia_tournament_realtime_broadcast(tid, 'live', 3, 'round_update')
os.environ['POST_MODE'] = 'http500'
emit_500 = mod._emit_trivia_tournament_realtime_broadcast(tid, 'settled', 7, 'settlement_update')
os.environ['POST_MODE'] = 'ok'

# 4. Transition detector across lifecycle: seed registration -> live open -> round 2 -> matchup resolved -> settled
mod._trivia_tournament_rt_state.clear()
post_calls_before_sync = len(post_calls)

# Tick 1 (cold-start registration): seeds state, emits 0 broadcasts
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'registration', 'current_round': 0}])
r1 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {'schedule': {}}})

# Tick 2 (opens live play): emits tournament_update
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'live', 'current_round': 1}])
r2 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {f'start:{tid}': {'ok': True}}})

# Tick 3 (advances round 1 -> 2): emits round_update
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'live', 'current_round': 2}])
r3 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {}})

# Tick 4 (same round 2, matchup resolved): emits bracket_update
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'live', 'current_round': 2}])
r4 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {'resolved': 4}})

# Tick 5 (unchanged live round 2, resolved=0): emits 0 broadcasts
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'live', 'current_round': 2}])
r5 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {}})

# Tick 6 (settled): emits settlement_update
db_rows_queue.append([{'id': tid, 'lifecycle_state': 'settled', 'current_round': 7}])
r6 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {f'settle:{tid}': {'ok': True}}})

# Tick 7 (standby owner=False): skips completely
r7 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': False, 'standby': True})

# Tick 8 (DB read fails): still emits explicit tick action without raising
os.environ['GET_MODE'] = 'error'
r8 = mod._trivia_nightly_sync_and_broadcast_transitions({'owner': True, 'actions': {f'settle:{tid}': {'ok': True}}})
os.environ.pop('GET_MODE', None)

# 5. Reminder dispatch returns push_handoff_count & push_outbox_status cleanly
rem = mod._trivia_nightly_reminder_dispatch(datetime(2026, 11, 25, 1, 45, tzinfo=timezone.utc))

print(json.dumps({
    'clean_topic': clean[0],
    'clean_event': clean[1],
    'clean_keys': sorted(clean[2].keys()),
    'bad_tid': bad_tid,
    'bad_extra_answer': bad_extra_answer,
    'bad_extra_pii': bad_extra_pii,
    'bad_round_bool': bad_round_bool,
    'emit_ok': emit_ok,
    'emit_timeout': emit_timeout,
    'emit_500': emit_500,
    'first_post': post_calls[0],
    'sync_counts': [len(r1), len(r2), len(r3), len(r4), len(r5), len(r6), len(r7), len(r8)],
    'sync_events': [
        [x['event'] for x in r2],
        [x['event'] for x in r3],
        [x['event'] for x in r4],
        [x['event'] for x in r6],
        [x['event'] for x in r8],
    ],
    'seq_monotonic': r2[0]['payload']['seq'] < r3[0]['payload']['seq'] < r4[0]['payload']['seq'] < r6[0]['payload']['seq'],
    'rem': rem,
}))
`;

    const proc = spawnSync('python3', ['-c', pyCode], { cwd: ROOT, encoding: 'utf8', timeout: 15_000 });
    assert.equal(proc.status, 0, `python realtime broadcast test failed: ${proc.stderr}`);
    const out = JSON.parse(proc.stdout.trim().split('\n').at(-1));

    assert.equal(out.clean_topic, 'trivia:tournament:41b958e0-655b-46fa-97d5-4f92c8b80874');
    assert.equal(out.clean_event, 'round_update');
    assert.deepEqual(out.clean_keys, [
        'currentRound',
        'entityId',
        'eventType',
        'seq',
        'state',
        'type',
        'updatedAt',
    ]);
    assert.equal(out.bad_tid, null);
    assert.equal(out.bad_extra_answer, null);
    assert.equal(out.bad_extra_pii, null);
    assert.equal(out.bad_round_bool, null);

    assert.equal(out.emit_ok.ok, true);
    assert.equal(out.emit_ok.sent, 1);
    assert.equal(out.first_post.url, 'https://example.supabase.co/realtime/v1/api/broadcast');
    assert.equal(out.first_post.timeout, 1.5);
    assert.equal(out.first_post.json.messages.length, 1);
    assert.equal(out.first_post.json.messages[0].topic, 'trivia:tournament:41b958e0-655b-46fa-97d5-4f92c8b80874');
    assert.equal(out.first_post.json.messages[0].payload.type, 'state_change');

    assert.equal(out.emit_timeout.ok, false);
    assert.equal(out.emit_timeout.reason, 'timeout');
    assert.equal(out.emit_500.ok, false);
    assert.equal(out.emit_500.status, 500);

    assert.deepEqual(out.sync_counts, [0, 1, 1, 1, 0, 1, 0, 1]);
    assert.deepEqual(out.sync_events, [
        ['tournament_update'],
        ['round_update'],
        ['bracket_update'],
        ['settlement_update'],
        ['settlement_update'],
    ]);
    assert.equal(out.seq_monotonic, true);
    assert.equal(out.rem.push_handoff_count, 2);
    assert.equal(out.rem.push_outbox_status, 'partial_enqueued');
    assert.equal(out.rem.physical_device_receipt_confirmed, false);

    // Verify fire_cron wiring in source
    const dispatcherSrc = read('scripts/openclaw-cron-dispatcher.py');
    const fireCronBody = dispatcherSrc.slice(
        dispatcherSrc.indexOf('def fire_cron('),
        dispatcherSrc.indexOf('def fire_script('),
    );
    assert.match(fireCronBody, /if path == TRIVIA_NIGHTLY_TOURNAMENT_JOB:/);
    assert.match(fireCronBody, /_trivia_nightly_sync_and_broadcast_transitions\(tick_payload\)/);
});
