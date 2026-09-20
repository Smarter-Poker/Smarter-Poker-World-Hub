/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The Club Arena app's push goes through the SAME outbox as Web Push
 *  (store readiness, phase 4a, 2026-09-08)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A native device token is a push_subscriptions row with transport = 'fcm'.
 * send-push.js picks the sender per row; deliverPushNow and the dispatch cron
 * call it instead of sendWebPush. This file pins:
 *   1. the FCM message says what the service worker would have said for the
 *      same payload, and carries the url the tap opens in data;
 *   2. dead-token classification retires a row, transient errors do not;
 *   3. the two delivery paths select the transport and call the one sender;
 *   4. the subscribe route accepts a token without keys and never dials it;
 *   5. the OAuth assertion is a well-formed RS256 JWT for the account.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { buildFcmMessage, isFcmTokenDead, sendFcm, signServiceAccountJwt, __resetFcmForTests } from '../src/lib/push/fcm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the FCM message carries title, body, url and tag the way the worker shows them', () => {
    const m = buildFcmMessage('tok'.repeat(10), {
        title: 'Seat Open At Table 4', body: 'You Are Next', url: '/hub/club-arena/table/t4', tag: 'seat:t4',
        data: { tableId: 't4', n: 2 },
    }, { ttl: 120 }).message;
    assert.equal(m.notification.title, 'Seat Open At Table 4');
    assert.equal(m.notification.body, 'You Are Next');
    assert.equal(m.data.url, '/hub/club-arena/table/t4');
    assert.equal(m.data.tag, 'seat:t4');
    assert.equal(m.data.tableId, 't4');
    assert.equal(m.data.n, '2', 'FCM data values are strings');
    assert.equal(m.android.ttl, '120s');
    assert.equal(m.android.notification.tag, 'seat:t4');
    assert.equal(m.apns.headers['apns-collapse-id'], 'seat:t4');
    assert.equal(m.apns.payload.aps.sound, 'default');
    assert.equal(m.apns.payload.aps['thread-id'], 'seat:t4');
});

test('dead tokens retire; transient failures do not', () => {
    assert.equal(isFcmTokenDead(404, {}), true);
    assert.equal(isFcmTokenDead(400, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }), true);
    assert.equal(isFcmTokenDead(400, { error: { message: 'The registration token is not a valid FCM registration token' } }), true);
    assert.equal(isFcmTokenDead(500, { error: { status: 'INTERNAL' } }), false);
    assert.equal(isFcmTokenDead(429, {}), false);
    assert.equal(isFcmTokenDead(503, {}), false);
});

test('sendFcm without a configured account fails soft and never retires the row', async () => {
    __resetFcmForTests();
    const saved = process.env.FCM_SERVICE_ACCOUNT_JSON;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    try {
        const r = await sendFcm({ endpoint: 'x'.repeat(40), transport: 'fcm' }, { title: 't' });
        assert.equal(r.ok, false);
        assert.equal(r.expired, false);
        assert.equal(r.error, 'fcm_not_configured');
    } finally {
        if (saved !== undefined) process.env.FCM_SERVICE_ACCOUNT_JSON = saved;
        __resetFcmForTests();
    }
});

test('sendFcm: a 404 from Firebase retires the token, a 200 accepts, the token is exchanged once', async () => {
    __resetFcmForTests();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const saved = process.env.FCM_SERVICE_ACCOUNT_JSON;
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
        client_email: 'fcm@test.iam.gserviceaccount.com', private_key: pem, project_id: 'club-arena-test',
        token_uri: 'https://oauth2.example/token',
    });
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes('oauth2.example')) {
            return { ok: true, status: 200, json: async () => ({ access_token: 'at-1', expires_in: 3600 }) };
        }
        const body = JSON.parse(init.body);
        if (body.message.token.startsWith('dead')) {
            return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) };
        }
        return { ok: true, status: 200, json: async () => ({ name: 'projects/x/messages/1' }) };
    };
    try {
        const good = await sendFcm({ endpoint: 'live-' + 'x'.repeat(40) }, { title: 'Hi' }, { fetch: fetchImpl });
        assert.equal(good.ok, true);
        const dead = await sendFcm({ endpoint: 'dead-' + 'x'.repeat(40) }, { title: 'Hi' }, { fetch: fetchImpl });
        assert.equal(dead.ok, false);
        assert.equal(dead.expired, true);
        const tokenCalls = calls.filter((c) => String(c.url).includes('oauth2.example'));
        assert.equal(tokenCalls.length, 1, 'the access token is cached across sends');
        const sendCalls = calls.filter((c) => String(c.url).includes('fcm.googleapis.com/v1/projects/club-arena-test/messages:send'));
        assert.equal(sendCalls.length, 2);
        assert.equal(sendCalls[0].init.headers.Authorization, 'Bearer at-1');
    } finally {
        if (saved !== undefined) process.env.FCM_SERVICE_ACCOUNT_JSON = saved; else delete process.env.FCM_SERVICE_ACCOUNT_JSON;
        __resetFcmForTests();
    }
});

test('the service-account assertion is an RS256 JWT the account key verifies', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = { clientEmail: 'a@b', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://t' };
    const jwt = signServiceAccountJwt(account, 1_700_000_000);
    const [h, c, s] = jwt.split('.');
    const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT' });
    const claims = dec(c);
    assert.equal(claims.iss, 'a@b');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.equal(claims.exp - claims.iat, 3600);
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    assert.equal(v.verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), true);
});

test('one sender, chosen per row; an unknown transport retires', () => {
    // send-push.js imports web-push.js, whose extensionless imports only
    // webpack resolves, so it is pinned by text here and exercised in the build.
    const src = read('src/lib/push/send-push.js');
    assert.ok(src.includes("if (transport === 'webpush') return sendWebPush(subscription, payload, opts);"));
    assert.ok(src.includes("if (transport === 'fcm') return sendFcm(subscription, payload, opts);"));
    assert.ok(src.includes("return { ok: false, expired: true, error: `unknown_transport:${transport}` };"));
    assert.match(src, /SUBSCRIPTION_COLUMNS = 'id, endpoint, p256dh, auth, transport'/);
});

test('both delivery paths select the transport and call sendPush, never sendWebPush directly', () => {
    for (const f of ['src/lib/push/push-deliver.js', 'pages/api/cron/push-dispatch.js']) {
        const src = read(f);
        assert.ok(src.includes('SUBSCRIPTION_COLUMNS'), `${f} selects the transport`);
        assert.ok(/\bsendPush\(/.test(src), `${f} calls sendPush`);
        assert.ok(!/\bsendWebPush\(/.test(src), `${f} must not call sendWebPush directly`);
    }
});

test('the subscribe route accepts a native token without keys, and never dials it', () => {
    const src = read('pages/api/push/subscribe.js');
    assert.ok(src.includes("body?.transport === 'fcm' ? 'fcm' : 'webpush'"));
    assert.ok(src.includes("Malformed device token"));
    // the host allowlist runs only for webpush
    const fcmBranch = src.slice(src.indexOf("if (transport === 'fcm') {"), src.indexOf('} else {', src.indexOf("if (transport === 'fcm') {")));
    assert.ok(!fcmBranch.includes('validatePushEndpoint'));
    assert.ok(src.includes('changePushSubscription(supabase, user.id,'));
    assert.ok(src.includes('endpoint, p256dh, auth, transport, platform'));
    assert.ok(!src.includes(".from('push_subscriptions')"), 'ownership changes belong to the atomic service contract');
});
