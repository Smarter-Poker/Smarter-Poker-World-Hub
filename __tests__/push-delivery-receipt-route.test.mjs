/**
 * Per-push device receipts (2026-11-11): the minting helper the dispatcher
 * calls and the POST /api/push/delivery-receipt handler.
 *
 * The database half (public.fn_mint_push_receipt / fn_record_push_receipt,
 * grants, idempotency on the real table) is proven natively by Club Arena
 * scripts/ci/test-push-receipt.py. This file proves the World Hub half with a
 * fake RPC that behaves like that function: only the SHA-256 of a minted token
 * matches, and a wrong token and an unknown id answer the same not_found.
 *
 * Run: node --test __tests__/push-delivery-receipt-route.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDeliveryReceiptHandler } from '../src/lib/push/delivery-receipt-handler.js';
import { hashReceiptToken, isReceiptEvent, mintDeviceReceipt, withDeviceReceipt } from '../src/lib/push/device-receipt.js';

const OUTBOX = 'aaaaaaaa-0000-4000-8000-000000000001';
const UNKNOWN = 'aaaaaaaa-0000-4000-8000-0000000000ff';
const SUB = 'bbbbbbbb-0000-4000-8000-000000000001';
const TOKEN = '0123456789abcdef'.repeat(4);
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** A fake of fn_record_push_receipt over one minted (outbox, token) pair. */
function fakeDb({ fail = false } = {}) {
    const rows = new Map([[`${OUTBOX}|${sha(TOKEN)}`, { received: null, displayed: null }]]);
    const calls = [];
    return {
        calls,
        rpc: async (name, args) => {
            calls.push({ name, args });
            if (fail) return { data: null, error: { message: 'connection reset' } };
            assert.equal(name, 'fn_record_push_receipt');
            const row = rows.get(`${args.p_outbox_id}|${args.p_token_sha256}`);
            if (!row) return { data: { ok: false, result: 'not_found' }, error: null };
            const fresh = !row.received || (args.p_stage === 'displayed' && !row.displayed);
            row.received ||= 't1';
            if (args.p_stage === 'displayed') row.displayed ||= 't1';
            return { data: { ok: true, result: fresh ? 'recorded' : 'duplicate', stage: row.displayed ? 'displayed' : 'received' }, error: null };
        },
    };
}

function call(handler, { method = 'POST', body } = {}) {
    const res = {
        statusCode: null, body: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        end() { return this; },
    };
    return handler({ method, body, headers: {} }, res).then(() => res);
}

const make = (db) => createDeliveryReceiptHandler({ getClient: () => db, rateLimit: () => true });

test('a genuine receipt is recorded and only the token hash reaches the database', async () => {
    const db = fakeDb();
    const res = await call(make(db), { body: { id: OUTBOX, token: TOKEN, stage: 'displayed' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, result: 'recorded', stage: 'displayed' });
    assert.equal(db.calls[0].args.p_token_sha256, sha(TOKEN));
    assert.ok(!JSON.stringify(db.calls).includes(TOKEN), 'the raw token is never sent to the database');
    assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('a repeated receipt is idempotent: duplicate, same stage, still 200', async () => {
    const handler = make(fakeDb());
    await call(handler, { body: { id: OUTBOX, token: TOKEN, stage: 'received' } });
    const second = await call(handler, { body: { id: OUTBOX, token: TOKEN, stage: 'received' } });
    assert.deepEqual(second.body, { ok: true, result: 'duplicate', stage: 'received' });
    const upgraded = await call(handler, { body: JSON.stringify({ id: OUTBOX, token: TOKEN, stage: 'displayed' }) });
    assert.deepEqual(upgraded.body, { ok: true, result: 'recorded', stage: 'displayed' });
    const again = await call(handler, { body: { id: OUTBOX, token: TOKEN, stage: 'displayed' } });
    assert.deepEqual(again.body, { ok: true, result: 'duplicate', stage: 'displayed' });
});

test('a forged token and an unknown id get the same 404 and leak nothing', async () => {
    const handler = make(fakeDb());
    const forged = await call(handler, { body: { id: OUTBOX, token: 'f'.repeat(64), stage: 'displayed' } });
    const unknown = await call(handler, { body: { id: UNKNOWN, token: TOKEN, stage: 'displayed' } });
    assert.equal(forged.statusCode, 404);
    assert.equal(unknown.statusCode, 404);
    assert.deepEqual(forged.body, { error: 'not_found' });
    assert.deepEqual(unknown.body, forged.body, 'the two refusals must be indistinguishable');
    assert.deepEqual(Object.keys(forged.headers).sort(), Object.keys(unknown.headers).sort());
});

test('malformed input is refused before the database; wrong method is 405; a database fault is 503', async () => {
    const db = fakeDb();
    const handler = make(db);
    for (const body of [
        undefined, 'not json', {},
        { id: 'not-a-uuid', token: TOKEN, stage: 'displayed' },
        { id: OUTBOX, token: TOKEN.toUpperCase(), stage: 'displayed' },
        { id: OUTBOX, token: TOKEN.slice(1), stage: 'displayed' },
        { id: OUTBOX, token: TOKEN, stage: 'read' },
        { id: OUTBOX, token: 123, stage: 'displayed' },
    ]) {
        const res = await call(handler, { body });
        assert.equal(res.statusCode, 400, JSON.stringify(body));
    }
    assert.equal(db.calls.length, 0);
    const get = await call(handler, { method: 'GET' });
    assert.equal(get.statusCode, 405);
    const down = await call(make(fakeDb({ fail: true })), { body: { id: OUTBOX, token: TOKEN, stage: 'displayed' } });
    assert.equal(down.statusCode, 503);
});

test('the rate limiter runs before anything else', async () => {
    const db = fakeDb();
    let limited = 0;
    const handler = createDeliveryReceiptHandler({
        getClient: () => db,
        rateLimit: (req, res) => { limited += 1; res.status(429).json({ error: 'slow down' }); return false; },
    });
    const res = await call(handler, { body: { id: OUTBOX, token: TOKEN, stage: 'displayed' } });
    assert.equal(res.statusCode, 429);
    assert.equal(limited, 1);
    assert.equal(db.calls.length, 0);
});

test('minting: only reliability_* rows to Web Push devices, hash stored, failure sends without a token', async () => {
    const calls = [];
    const ok = { rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; } };
    const row = { id: OUTBOX, event: 'reliability_escalation' };
    const token = await mintDeviceReceipt(ok, row, { id: SUB, transport: 'webpush' });
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(calls[0].name, 'fn_mint_push_receipt');
    assert.deepEqual(calls[0].args, { p_outbox_id: OUTBOX, p_subscription_id: SUB, p_token_sha256: hashReceiptToken(token) });
    const second = await mintDeviceReceipt(ok, row, { id: SUB, transport: 'webpush' });
    assert.notEqual(second, token, 'every mint is a fresh random token');

    assert.equal(await mintDeviceReceipt(ok, { id: OUTBOX, event: 'new_message' }, { id: SUB }), null);
    assert.equal(await mintDeviceReceipt(ok, row, { id: SUB, transport: 'fcm' }), null);
    assert.equal(calls.length, 2, 'ineligible rows never reach the database');
    assert.equal(await mintDeviceReceipt({ rpc: async () => ({ data: false, error: null }) }, row, { id: SUB }), null);
    assert.equal(await mintDeviceReceipt({ rpc: async () => ({ data: null, error: { message: 'missing function' } }) }, row, { id: SUB }), null);
    assert.equal(await mintDeviceReceipt({ rpc: async () => { throw new Error('offline'); } }, row, { id: SUB }), null);

    assert.equal(isReceiptEvent('reliability_escalation'), true);
    assert.equal(isReceiptEvent('system'), false);
    const base = { title: 't', data: { event: 'reliability_escalation', outboxId: OUTBOX } };
    assert.equal(withDeviceReceipt(base, OUTBOX, null), base);
    assert.deepEqual(withDeviceReceipt(base, OUTBOX, token).data, { event: 'reliability_escalation', outboxId: OUTBOX, receipt: { id: OUTBOX, token } });
    assert.equal(base.data.receipt, undefined, 'the shared payload is never mutated across devices');
});

test('the dispatcher mints per device and the route uses the patched server client', () => {
    const dispatch = readFileSync(new URL('../pages/api/cron/push-dispatch.js', import.meta.url), 'utf8');
    assert.match(dispatch, /mintDeviceReceipt\(supabase, row, sub\)/);
    assert.match(dispatch, /withDeviceReceipt\(payload, row\.id, token\)/);
    const route = readFileSync(new URL('../pages/api/push/delivery-receipt.js', import.meta.url), 'utf8');
    assert.match(route, /src\/lib\/supabaseServerClient/);
    assert.doesNotMatch(route, /@supabase\/supabase-js/);
});
