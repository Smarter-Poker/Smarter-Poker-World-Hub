/**
 * THE ENROLLMENT WORKER MUST REPORT WHAT IT DISPLAYS (2026-09-27).
 *
 * public/push/sw.js owns every World Hub enrollment. Until 2026-09-27 its push
 * handler displayed the banner and never called /api/push/receipt, so every
 * subscription made through it kept last_receipt_at NULL. Production on
 * 2026-09-27: 4 active subscriptions, none with a receipt since 2026-09-01,
 * while rows enrolled through the root worker (which does beacon) carried
 * receipts. /api/cron/push-health reads a NULL receipt as a zombie and retires
 * it as `no_receipt_while_sibling_confirmed` beside a confirming sibling.
 *
 * This test RUNS the real worker source in a controlled service-worker global
 * and dispatches real push events at it. It does not prove a physical device
 * displayed anything; it proves the worker's own code path.
 *
 * Run: node --test __tests__/push-worker-delivery-receipt.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'public/push/sw.js'), 'utf8');
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-endpoint-123';

function loadWorker({ subscription = { endpoint: ENDPOINT }, showNotification, fetchImpl } = {}) {
    const listeners = {};
    const fetches = [];
    const shown = [];
    const self = {
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: () => {},
        clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => null },
        location: { origin: 'https://smarter.poker' },
        navigator: {},
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        registration: {
            getNotifications: async () => [],
            showNotification: showNotification || (async (title, options) => { shown.push({ title, options }); }),
            pushManager: { getSubscription: async () => subscription },
        },
    };
    const fetch = async (url, init) => {
        fetches.push({ url, init });
        if (fetchImpl) return fetchImpl(url, init);
        return { ok: true, status: 204 };
    };
    vm.runInNewContext(SOURCE, { self, fetch, console, URL, setTimeout, clearTimeout });
    return { listeners, fetches, shown, self };
}

async function dispatchPush(worker, payload) {
    let settled;
    const event = {
        data: { json: () => payload, text: () => JSON.stringify(payload) },
        waitUntil: (p) => { settled = p; },
    };
    worker.listeners.push(event);
    assert.ok(settled, 'the push handler must extend the event lifetime with waitUntil');
    await settled;
}

test('a displayed push reports a delivery receipt for this subscription', async () => {
    const worker = loadWorker();
    await dispatchPush(worker, { title: 'seat open', body: 'table 4', url: '/hub/club-arena' });
    assert.equal(worker.shown.length, 1, 'the notification must be displayed');
    const receipts = worker.fetches.filter((f) => f.url === '/api/push/receipt');
    assert.equal(receipts.length, 1, 'exactly one receipt per displayed push');
    assert.equal(receipts[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(receipts[0].init.body), { endpoint: ENDPOINT });
    assert.equal(receipts[0].init.keepalive, true, 'the beacon must survive the worker being stopped');
});

test('the receipt is sent only after display, including the minimal-options fallback', async () => {
    const order = [];
    let calls = 0;
    const worker = loadWorker({
        showNotification: async () => {
            calls += 1;
            if (calls === 1) throw new TypeError('options rejected by this OS');
            order.push('shown');
        },
        fetchImpl: async (url) => { order.push(url); return { ok: true, status: 204 }; },
    });
    await dispatchPush(worker, { title: 't', body: 'b' });
    assert.deepEqual(order, ['shown', '/api/push/receipt']);
});

test('no receipt is claimed when nothing could be displayed', async () => {
    const worker = loadWorker({ showNotification: async () => { throw new Error('refused'); } });
    await dispatchPush(worker, { title: 't' });
    assert.equal(worker.fetches.filter((f) => f.url === '/api/push/receipt').length, 0);
});

test('a missing subscription or a failing receipt never breaks the push handler', async () => {
    const none = loadWorker({ subscription: null });
    await dispatchPush(none, { title: 't' });
    assert.equal(none.shown.length, 1);
    assert.equal(none.fetches.length, 0);

    const failing = loadWorker({ fetchImpl: async () => { throw new Error('offline'); } });
    await dispatchPush(failing, { title: 't' });
    assert.equal(failing.shown.length, 1, 'display must not depend on the receipt');
});

test('accounting pushes keep their private text redacted and still report a receipt', async () => {
    const worker = loadWorker();
    await dispatchPush(worker, { title: 'Invoice 42 for Club X', body: 'You owe 500', event: 'accounting_invoice' });
    assert.equal(worker.shown[0].title, 'New Accounting Notice');
    assert.equal(worker.fetches.filter((f) => f.url === '/api/push/receipt').length, 1);
});
