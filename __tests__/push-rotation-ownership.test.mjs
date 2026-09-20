// UNRUN source successor. Protected local execution only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createPushRotationHandler, rotatePushSubscription } from '../src/lib/push/subscription-rotation.mjs';
import { validatePushEndpoint, validatePushKeys, samePushService } from '../src/lib/push/push-endpoint.js';
const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const sourceId = '00000000-0000-4000-8000-000000000010';
const targetId = '00000000-0000-4000-8000-000000000011';
const oldKeys = { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 7).toString('base64url') };
const keys = { p256dh: Buffer.alloc(65, 5).toString('base64url'), auth: Buffer.alloc(16, 8).toString('base64url') };
const body = { oldEndpoint: 'https://fcm.googleapis.com/fixture-old', endpoint: 'https://fcm.googleapis.com/fixture-new', oldKeys, keys };
const source = { id: sourceId, user_id: actor, endpoint: body.oldEndpoint, transport: 'webpush',
    device_id: 'fixture-device-rotation', rotation_revision: '9007199254740993', ...oldKeys };
const receipt = { schema_version: 1, success: true, user_id: actor, source_subscription_id: sourceId,
    source_revision: source.rotation_revision, retired_revision: '9007199254740994', subscription_id: targetId,
    rotation_revision: '1', old_endpoint: body.oldEndpoint, endpoint: body.endpoint,
    device_id: source.device_id, transport: 'webpush' };
function database({ rows = [source], lookupError = null, rpcError = null, response = receipt, beforeRpc } = {}) {
    const calls = [];
    const db = { calls, from(table) {
        calls.push(['from', table]);
        const query = { select(value) { calls.push(['select', value]); return query; },
            eq(key, value) { calls.push(['eq', key, value]); return query; },
            async limit(value) { calls.push(['limit', value]); return { data: rows, error: lookupError }; },
            update() { assert.fail('independent subscription update'); }, upsert() { assert.fail('independent upsert'); } };
        return query;
    }, async rpc(name, args) {
        calls.push(['rpc', name, args]); if (beforeRpc) return beforeRpc(name, args);
        return { data: response, error: rpcError };
    } };
    return db;
}
function handler(db, user = { id: actor }) {
    return createPushRotationHandler({ getDatabase: () => db, getUser: async () => ({ user }), rateLimit: () => true,
        validateEndpoint: validatePushEndpoint, validateKeys: validatePushKeys, sameService: samePushService });
}
function response() { return { code: null, headers: {}, value: null, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; }, json(value) { this.value = value; return this; } }; }
test('sessionless request refuses before any source read or RPC', async () => {
    const db = database(), res = response();
    await handler(db, null)({ method: 'POST', body }, res);
    assert.equal(res.code, 401); assert.deepEqual(db.calls, []); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('method and malformed/absent proofs refuse without source lookup', async () => {
    for (const [method, value, status] of [['GET', body, 405], ['POST', {}, 400], ['POST', { ...body, oldKeys: null }, 400],
        ['POST', { ...body, endpoint: body.oldEndpoint }, 400], ['POST', { ...body, endpoint: 'http://127.0.0.1' }, 400],
        ['POST', { ...body, endpoint: 'https://web.push.apple.com/fixture-new' }, 400]]) {
        const db = database(), res = response(); await handler(db)({ method, body: value }, res);
        assert.equal(res.code, status); assert.deepEqual(db.calls, []);
    }
});
test('verified actor scopes read and exact bigint text plus both secrets scope one CAS RPC', async () => {
    const db = database(), res = response(); await handler(db)({ method: 'POST', body: { ...body, user_id: other } }, res);
    assert.equal(res.code, 200); assert.equal(res.value.receipt, receipt);
    assert.ok(db.calls.some(x => x[0] === 'eq' && x[1] === 'user_id' && x[2] === actor));
    assert.ok(db.calls.some(x => x[0] === 'select' && x[1].includes('rotation_revision::text')));
    const rpc = db.calls.filter(x => x[0] === 'rpc'); assert.equal(rpc.length, 1);
    assert.deepEqual(rpc[0], ['rpc', 'fn_rotate_push_subscription', { p_user_id: actor,
        p_expected: { id: sourceId, endpoint: body.oldEndpoint, transport: 'webpush', device_id: source.device_id,
            rotation_revision: '9007199254740993', ...oldKeys },
        p_replacement: { endpoint: body.endpoint, ...keys } }]);
});
test('fresh lookup after B takeover does not infer B as actor for delayed A request', async () => {
    for (const rows of [[], [{ ...source, user_id: other }], [source, source]]) {
        const db = database({ rows }), res = response(); await handler(db)({ method: 'POST', body }, res);
        assert.equal(res.code, 409); assert.equal(db.calls.filter(x => x[0] === 'rpc').length, 0);
    }
});
test('account switch after lookup is refused by CAS, with no latest-owner retry', async () => {
    const db = database({ beforeRpc(name, args) {
        assert.equal(args.p_user_id, actor); assert.equal(args.p_expected.rotation_revision, source.rotation_revision);
        return { error: { code: '23514', message: 'push_rotation_conflict' } };
    } }), res = response();
    await handler(db)({ method: 'POST', body }, res);
    assert.equal(res.code, 409); assert.equal(db.calls.filter(x => x[0] === 'rpc').length, 1);
});
test('unknown device, wrong keys/transport and imprecise observed versions never write', async () => {
    for (const changed of [{ device_id: null }, { auth: 'different' }, { p256dh: 'different' }, { transport: 'fcm' },
        { rotation_revision: 9007199254740992 }, { rotation_revision: '01' }, { rotation_revision: '9223372036854775808' }]) {
        const db = database({ rows: [{ ...source, ...changed }] }), res = response();
        await handler(db)({ method: 'POST', body }, res);
        assert.ok([409, 503].includes(res.code)); assert.equal(db.calls.filter(x => x[0] === 'rpc').length, 0);
    }
});
test('RPC errors, throws, lost replies and malformed receipts never claim rotation or expose raw errors', async () => {
    const raw = 'PRIVATE-KEY-ENDPOINT';
    for (const config of [{ lookupError: { message: raw } }, { rpcError: { message: raw } },
        { beforeRpc() { throw Error(raw); } }, ...[null, {}, { ...receipt, success: false },
            { ...receipt, user_id: other }, { ...receipt, endpoint: 'wrong' }, { ...receipt, device_id: 'wrong' },
            { ...receipt, source_subscription_id: targetId }, { ...receipt, subscription_id: sourceId },
            { ...receipt, source_revision: 9007199254740992 }, { ...receipt, retired_revision: '9007199254740995' },
            { ...receipt, rotation_revision: 1 }].map(value => ({ response: value }))]) {
        const db = database(config), res = response(); await handler(db)({ method: 'POST', body }, res);
        assert.equal(res.code, 503); assert.doesNotMatch(JSON.stringify(res.value), /PRIVATE-KEY-ENDPOINT/);
    }
});
test('real route wires verified server auth, endpoint validators and the shared CAS adapter', () => {
    const src = readFileSync(new URL('../pages/api/push/rotate.js', import.meta.url), 'utf8');
    assert.match(src, /getUser: getServerUserWithFallback/); assert.match(src, /validateEndpoint: validatePushEndpoint/);
    assert.match(src, /validateKeys: validatePushKeys, sameService: samePushService/);
    assert.match(src, /export default createPushRotationHandler/); assert.doesNotMatch(src, /\.(update|upsert)\(/);
});

for (const file of ['../public/push/sw.js', '../worker/index.js']) {
    test(`${file}: actual rotation handler refuses HTTP/malformed replies without reporting healed`, async () => {
        for (const result of [{ ok: false, status: 401 }, { ok: false, status: 409 }, { ok: false, status: 503 },
            { ok: true, async json() { return {}; } }, { ok: true, async json() { throw Error('bad response'); } },
            { ok: true, async json() { return { ok: true, rotated: true, receipt: { ...receipt, endpoint: 'wrong' } }; } },
            { ok: true, async json() { return { ok: true, rotated: true, receipt }; }, confirmed: true }]) {
            const listeners = new Map(), logs = [], requests = [];
            const self = { location: { origin: 'https://smarter.poker' }, atob: value => Buffer.from(value, 'base64').toString('binary'),
                addEventListener: (name, fn) => listeners.set(name, fn), registration: { pushManager: {
                    async subscribe() { return { endpoint: body.endpoint, toJSON() { return { endpoint: body.endpoint, keys }; } }; }
                } } };
            const fetch = async (url, options) => { requests.push([url, options]);
                return url.endsWith('vapid-public-key') ? { ok: true, async json() { return { key: oldKeys.p256dh }; } } : result;
            };
            runInNewContext(readFileSync(new URL(file, import.meta.url), 'utf8'), {
                self, fetch, URL, Date, Uint8Array, console: { log: (...v) => logs.push(v.join(' ')), warn: (...v) => logs.push(v.join(' ')) }
            });
            const pending = [];
            listeners.get('pushsubscriptionchange')({ oldSubscription: { endpoint: body.oldEndpoint, toJSON() { return { keys: oldKeys }; } },
                waitUntil(p) { pending.push(p); } });
            await Promise.all(pending);
            assert.equal(requests.filter(x => x[0] === '/api/push/rotate').length, 1);
            assert.equal(logs.some(x => x.includes('Server confirmed subscription rotation.')), Boolean(result.confirmed));
            assert.ok(logs.every(x => !x.includes('self-healed')));
        }
    });
}
