import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as gate from '../src/lib/push/push-gate.js';
import { buildFcmMessage } from '../src/lib/push/fcm.js';

function load(path, modules) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function('require', 'exports', code)(id => {
        assert.ok(id in modules, `Unexpected dependency ${id}`);
        return modules[id];
    }, exports);
    return exports;
}

function fixture(count = 1) {
    const now = Date.now();
    const rows = Array.from({ length: count }, (_, i) => ({
        id: `outbox-${i}`, recipient_user_id: 'recipient', event: 'accounting_invoice',
        accounting_notification_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        related_entity_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        title: `Invoice ${i + 1}`, body: `Receipt ${i + 1}`, url: `/hub/messenger?conversation=shared&receipt=${i}`,
        tag: 'accounting_invoice:shared-conversation', status: 'processing',
        created_at: new Date(now).toISOString(), claimed_at: new Date(now).toISOString(), attempts: 1,
    }));
    const state = { rows, prefs: [], legacy: [], runs: [], calls: [], exactCounts: 0,
        subscriptions: [{ id: 'device-1', user_id: 'recipient', is_active: true, endpoint: 'fixture-device-1', transport: 'webpush' }],
        fail: null, nullResult: null, ackFails: false, slotClaimed: false, sentToday: 0, provider: () => ({ ok: true }) };
    function from(table) {
        const filters = []; let patch = null, inserted = null, single = false, head = false;
        const q = {
            select(_columns, options) { head = options?.head === true; return q; },
            update(value) { patch = value; return q; }, insert(value) { inserted = value; return q; },
            eq(k, v) { filters.push(r => r[k] === v); return q; },
            in(k, values) { filters.push(r => values.includes(r[k])); return q; },
            gte(k, v) { filters.push(r => r[k] >= v); return q; },
            maybeSingle() { single = true; return q; },
            then(resolve, reject) { return Promise.resolve().then(() => {
                if (state.fail === table || (patch && table === 'push_outbox' && state.ackFails)) {
                    return { data: null, error: { message: 'Injected failure' } };
                }
                if (state.nullResult === table) return { data: null, error: null };
                if (head) { state.exactCounts++; return { data: null, count: state.sentToday, error: null }; }
                const source = table === 'push_outbox' ? state.rows : table === 'push_subscriptions' ? state.subscriptions
                    : table === 'notification_preferences' ? state.prefs : table === 'user_notification_preferences' ? state.legacy : state.runs;
                if (inserted) {
                    if (state.slotClaimed) return { data: null, error: { code: '23505' } };
                    state.slotClaimed = true; source.push({ id: 'run-1', ...inserted });
                }
                const matches = source.filter(row => filters.every(fn => fn(row)));
                if (patch) for (const row of matches) Object.assign(row, patch);
                return { data: single ? (matches[0] ? { ...matches[0] } : null) : matches.map(r => ({ ...r })), error: null };
            }).then(resolve, reject); },
        };
        return q;
    }
    const db = { from, async rpc(name) {
        if (name === 'requeue_stuck_push_outbox') return { data: 0, error: null };
        assert.equal(name, 'claim_push_outbox_batch');
        const claimed = state.rows.filter(r => r.status === 'pending' && r.attempts < 5
            && (r.next_attempt_at == null || Date.parse(r.next_attempt_at) <= Date.now()));
        for (const row of claimed) Object.assign(row, { status: 'processing', claimed_at: new Date(now + row.attempts).toISOString(), attempts: row.attempts + 1 });
        return { data: claimed.map(row => ({ ...row })), error: null };
    }};
    const send = async (sub, payload) => {
        state.calls.push({ sub, payload });
        return state.provider(sub, payload);
    };
    const sendModule = { sendPush: send, SUBSCRIPTION_COLUMNS: 'id,endpoint,transport' };
    const failure = { recordSendFailure: async () => false };
    const sender = load('../src/lib/push/accounting-delivery.js', {
        './send-push': sendModule, './push-deliver': failure, './push-gate.js': gate,
    });
    const cron = load('../pages/api/cron/push-dispatch.js', {
        '../../../src/lib/supabaseServerClient': { createClient: () => db },
        '../../../src/utils/cron-auth': { validateCronAuth: () => true },
        '../../../src/lib/cronHealth': { withCronHealth: (_name, handler) => handler },
        '../../../src/lib/push/web-push': { isPushConfigured: () => true },
        '../../../src/lib/push/send-push': sendModule,
        '../../../src/lib/push/push-deliver': failure,
        '../../../src/lib/push/accounting-delivery': sender,
        '../../../src/lib/push/tournament-reminder-delivery': { isTournamentReminder: () => false },
        '../../../src/lib/push/push-gate': gate,
    });
    const run = async () => {
        const res = { code: 0, body: null, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
        await cron.default({}, res); return res;
    };
    return { state, db, rows, sender, run,
        deliver: (row = rows[0]) => sender.deliverAccountingPush(db, { ...row }, { now: () => now }),
        pending() { for (const row of rows) { row.status = 'pending'; row.attempts = 0; } },
    };
}

test('three invoices in one conversation each reach the provider without digest or device collapse', async () => {
    const f = fixture(3); f.pending();
    const response = await f.run();
    assert.equal(response.code, 200); assert.equal(response.body.sent, 3); assert.equal(response.body.digested, 0);
    assert.equal(f.state.calls.length, 3); assert.equal(new Set(f.state.calls.map(c => c.payload.tag)).size, 3);
    for (const [i, row] of f.rows.entries()) {
        assert.equal(row.status, 'sent'); assert.equal(row.title, `Invoice ${i + 1}`);
        assert.equal(f.state.calls[i].payload.body, row.body); assert.equal(f.state.calls[i].payload.url, row.url);
        assert.equal(f.state.calls[i].payload.data.outboxId, row.id);
        const native = buildFcmMessage('fixture-token', f.state.calls[i].payload).message;
        assert.equal(native.android.notification.tag, f.state.calls[i].payload.tag);
        assert.equal(native.apns.headers['apns-collapse-id'], f.state.calls[i].payload.tag);
        assert.ok(native.apns.headers['apns-collapse-id'].length <= 64);
    }
});

test('a temporary refusal retries only its original receipt and never resends the completed invoices', async () => {
    const f = fixture(3); f.pending();
    f.state.provider = (_sub, payload) => ({ ok: payload.data.outboxId !== 'outbox-1', error: 'temporary' });
    const first = await f.run(); assert.equal(first.code, 503); assert.equal(first.body.ok, false);
    assert.deepEqual(f.rows.map(r => r.status), ['sent', 'pending', 'sent']);
    const firstTag = f.state.calls.find(c => c.payload.data.outboxId === 'outbox-1').payload.tag;
    f.state.provider = () => ({ ok: true }); f.state.slotClaimed = false;
    await f.run();
    assert.deepEqual(f.state.calls.map(c => c.payload.data.outboxId), ['outbox-0', 'outbox-1', 'outbox-2', 'outbox-1']);
    assert.equal(f.state.calls.at(-1).payload.tag, firstTag); assert.equal(f.state.calls.at(-1).payload.renotify, false);
    assert.equal(f.rows.length, 3); assert.ok(f.rows.every(r => r.status === 'sent'));
    const duplicateRun = await f.run(); assert.equal(duplicateRun.body.skipped, 'slot_already_claimed');
    assert.equal(f.state.calls.length, 4);
});

test('ordinary social messages still digest independently beside distinct invoices', async () => {
    const f = fixture(3); f.pending();
    f.rows.push(...Array.from({ length: 3 }, (_, i) => ({ ...f.rows[0], id: `social-${i}`, event: 'new_message',
        accounting_notification_id: null, related_entity_id: null })));
    const r = await f.run(); assert.equal(r.body.sent, 4); assert.equal(r.body.digested, 2);
    assert.equal(f.state.calls.filter(c => c.payload.data.event === 'accounting_invoice').length, 3);
});

for (const [label, prefs, reason] of [
    ['all muted', { mute_all: true }, 'mute_all'],
    ['push disabled', { push_enabled: false }, 'push_disabled'],
    ['financial notifications disabled', { push_type_prefs: { cashier: false } }, 'type_disabled:cashier'],
    ['quiet hours', { quiet_hours_start: 0, quiet_hours_end: 23, quiet_hours_tz: 'UTC' }, 'quiet_hours'],
]) test(`accounting respects ${label}`, async () => {
    const f = fixture(); f.state.prefs = [{ user_id: 'recipient', ...prefs }];
    if (label === 'quiet hours') {
        const hour = new Date().getUTCHours();
        f.state.prefs[0].quiet_hours_start = hour;
        f.state.prefs[0].quiet_hours_end = (hour + 1) % 24;
    }
    const r = await f.deliver();
    if (label === 'quiet hours') {
        assert.equal(r.deferred, 1); assert.equal(f.rows[0].status, 'pending');
        assert.equal(f.rows[0].failure_reason, `accounting_deferred:${reason}`); assert.equal(f.rows[0].attempts, 0);
    } else { assert.equal(r.skipped, 1); assert.equal(f.rows[0].failure_reason, reason); }
    assert.equal(f.state.calls.length, 0);
});

test('the exact daily aggregate enforces a cap above a default returned-row limit', async () => {
    const f = fixture(); f.state.sentToday = 2200; f.state.prefs = [{ user_id: 'recipient', daily_push_cap: 2000 }];
    assert.equal((await f.deliver()).deferred, 1); assert.equal(f.rows[0].failure_reason, 'accounting_deferred:daily_cap_reached:2000');
    assert.equal(f.state.exactCounts, 1); assert.equal(f.state.calls.length, 0);
});

for (const table of ['notification_preferences', 'user_notification_preferences', 'push_subscriptions']) {
    test(`${table} failure is retryable and never grants consent or invents no subscription`, async () => {
        const f = fixture(); f.state.fail = table;
        assert.equal((await f.deliver()).failed, 1); assert.equal(f.rows[0].status, 'pending');
        assert.notEqual(f.rows[0].failure_reason, 'no_subscription'); assert.equal(f.state.calls.length, 0);
    });
}

test('a real empty device list has an explicit skipped receipt', async () => {
    const f = fixture(); f.state.subscriptions = [];
    assert.equal((await f.deliver()).skipped, 1); assert.equal(f.rows[0].failure_reason, 'no_subscription');
});

test('unknown preference results do not default to permission to push', async () => {
    const f = fixture(); f.state.nullResult = 'notification_preferences';
    assert.equal((await f.deliver()).failed, 1); assert.equal(f.rows[0].status, 'pending');
    assert.equal(f.state.calls.length, 0);
});

test('an unknown daily count remains retryable instead of becoming zero', async () => {
    const f = fixture(); f.state.sentToday = null; f.state.prefs = [{ user_id: 'recipient', daily_push_cap: 20 }];
    assert.equal((await f.deliver()).failed, 1); assert.equal(f.rows[0].status, 'pending');
    assert.equal(f.state.calls.length, 0);
});

test('event names and forged metadata do not establish accounting provenance', async () => {
    const f = fixture(); f.rows[0].accounting_notification_id = null;
    f.rows[0].data = { accounting_notification_id: '00000000-0000-4000-8000-000000000001' };
    assert.equal((await f.deliver()).failed, 1); assert.equal(f.state.calls.length, 0);
});

test('an old claim and a replay of a completed receipt cannot send or overwrite it', async () => {
    const f = fixture(); const old = { ...f.rows[0] };
    f.rows[0].claimed_at = new Date(Date.now() + 1000).toISOString();
    assert.equal((await f.deliver(old)).uncertain, 1); assert.equal(f.state.calls.length, 0);
    assert.equal((await f.deliver()).sent, 1);
    assert.equal((await f.deliver()).uncertain, 1); assert.equal(f.state.calls.length, 1); assert.equal(f.rows[0].status, 'sent');
});

test('unknown provider acceptance acknowledgment remains uncertain instead of claiming success', async () => {
    const f = fixture(); f.state.ackFails = true;
    const r = await f.deliver(); assert.equal(r.uncertain, 1); assert.equal(r.sent, 0);
    assert.equal(f.rows[0].status, 'processing'); assert.equal(f.state.calls.length, 1);
});

test('an uncertain accounting delivery marks cron health failed rather than green', async () => {
    const f = fixture(); f.pending(); f.state.ackFails = true;
    const response = await f.run(); assert.equal(response.code, 503); assert.equal(response.body.ok, false);
    assert.equal(response.body.sent, 0); assert.equal(response.body.failed, 1); assert.equal(f.state.calls.length, 1);
    assert.match(f.state.runs[0].note, /accounting_delivery_incomplete:1/);
});

test('provider exceptions remain uncertain and retain the same receipt', async () => {
    const f = fixture(); f.state.provider = () => { throw new Error('connection lost'); };
    assert.equal((await f.deliver()).uncertain, 1); assert.equal(f.rows[0].status, 'processing');
    assert.equal(f.rows[0].failure_reason, 'accounting_delivery_acknowledgment_uncertain');
});

test('duplicate endpoint rows send once while separate devices remain separate', async () => {
    const f = fixture(); f.state.subscriptions.push({ ...f.state.subscriptions[0], id: 'duplicate' },
        { ...f.state.subscriptions[0], id: 'second', endpoint: 'fixture-device-2' });
    assert.equal((await f.deliver()).sent, 1); assert.equal(f.state.calls.length, 2);
});

test('partial device refusal remains visible without resending the accepted device', async () => {
    const f = fixture(); f.state.subscriptions.push({ ...f.state.subscriptions[0], id: 'second', endpoint: 'fixture-device-2' });
    f.state.provider = sub => ({ ok: sub.id === 'device-1', error: 'temporary' });
    const r = await f.deliver(); assert.equal(r.sent, 1); assert.equal(r.failed, 1);
    assert.equal(f.rows[0].failure_reason, 'accounting_partial_device_failure:1');
    await f.deliver(); assert.equal(f.state.calls.length, 2);
});

test('real provider failures remain bounded while a verified invoice survives a long dispatch outage', async () => {
    const f = fixture(); f.rows[0].attempts = 5; f.state.provider = () => ({ ok: false, error: 'refused' });
    assert.equal((await f.deliver()).failed, 1); assert.equal(f.rows[0].status, 'failed');
    const g = fixture(); g.rows[0].created_at = new Date(Date.now() - 7 * 86400_000).toISOString();
    assert.equal((await g.deliver()).sent, 1); assert.equal(g.rows[0].failure_reason, null);
    assert.equal(g.state.calls.length, 1);
});

test('preference deferrals preserve the receipt beyond five cycles and eventually send exactly that receipt', async () => {
    const f = fixture(); f.pending(); f.state.sentToday = 20;
    f.state.prefs = [{ user_id: 'recipient', daily_push_cap: 20 }];
    for (let i = 0; i < 7; i++) {
        f.state.slotClaimed = false; f.rows[0].next_attempt_at = new Date(Date.now() - 1000).toISOString();
        const response = await f.run();
        assert.equal(response.body.deferred, 1); assert.equal(response.body.skipped, 0); assert.equal(response.code, 200);
        assert.equal(f.rows[0].attempts, 0); assert.equal(f.rows[0].status, 'pending');
        assert.ok(Date.parse(f.rows[0].next_attempt_at) > Date.now());
        f.state.slotClaimed = false;
        assert.equal((await f.run()).body.claimed, 0, 'future retries do not occupy a claim batch');
    }
    assert.equal(f.state.calls.length, 0); assert.equal(f.rows.length, 1);
    f.state.sentToday = 0; f.rows[0].next_attempt_at = new Date(Date.now() - 1000).toISOString(); f.state.slotClaimed = false;
    const delivered = await f.run(); assert.equal(delivered.body.sent, 1); assert.equal(f.rows[0].attempts, 1);
    assert.equal(f.state.calls.length, 1); assert.equal(f.state.calls[0].payload.data.outboxId, 'outbox-0');
    assert.equal(f.rows[0].next_attempt_at, null);
});

test('archived and historical skipped receipts stay skipped while a delayed valid invoice sends', async () => {
    const f = fixture(3); f.pending();
    f.rows[0].status = 'skipped'; f.rows[0].failure_reason = 'accounting_archived_detail';
    f.rows[1].status = 'skipped'; f.rows[1].failure_reason = 'historical_gap_receipt';
    for (const row of f.rows) row.created_at = new Date(Date.now() - 7 * 86400_000).toISOString();
    assert.equal((await f.run()).body.sent, 1);
    assert.deepEqual(f.rows.map(r => r.status), ['skipped', 'skipped', 'sent']);
    assert.deepEqual(f.state.calls.map(c => c.payload.data.outboxId), ['outbox-2']);
});

test('budget release returns only the current claim and never changes a newer owner', async () => {
    const f = fixture(); const stale = { ...f.rows[0] };
    f.rows[0].claimed_at = new Date(Date.now() + 1000).toISOString();
    await assert.rejects(f.sender.releaseAccountingPush(f.db, stale)); assert.equal(f.rows[0].status, 'processing');
    await f.sender.releaseAccountingPush(f.db, { ...f.rows[0] });
    assert.equal(f.rows[0].status, 'pending'); assert.equal(f.rows[0].attempts, 0);
});
