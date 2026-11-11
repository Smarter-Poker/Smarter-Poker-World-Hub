/**
 * PER-PUSH DEVICE RECEIPT (2026-11-11). Runs the real source of BOTH push
 * workers (public/push/sw.js, which owns current enrollments, and the root
 * worker/index.js for legacy rows) in a controlled service-worker global and
 * dispatches real push events at them. Proves: a push carrying data.receipt is
 * acknowledged exactly once to /api/push/delivery-receipt, as 'displayed' after
 * the banner or 'received' when the OS refused it; a failed acknowledgement
 * never stops or repeats a notification; a push without a receipt sends none.
 *
 * It does not prove a physical device displayed anything.
 *
 * Run: node --test __tests__/push-worker-device-receipt.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKERS = ['public/push/sw.js', 'worker/index.js'];
const ENDPOINT = 'https://web.push.apple.com/test-endpoint';
const RECEIPT = { id: 'aaaaaaaa-0000-4000-8000-000000000001', token: 'ab'.repeat(32) };
const PATH = '/api/push/delivery-receipt';

function loadWorker(file, { showNotification, fetchImpl } = {}) {
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
            pushManager: { getSubscription: async () => ({ endpoint: ENDPOINT }) },
        },
    };
    const fetch = async (url, init) => {
        fetches.push({ url, init });
        if (fetchImpl) return fetchImpl(url, init);
        return { ok: true, status: 200 };
    };
    // worker/index.js is an ES module bundled by next-pwa; strip import lines
    // so the push handler can run in a plain script context.
    const source = readFileSync(join(ROOT, file), 'utf8').replace(/^import .*$/gm, '');
    vm.runInNewContext(source, { self, fetch, console, URL, setTimeout, clearTimeout, Response: class {}, caches: {} });
    return { listeners, fetches, shown };
}

async function dispatchPush(worker, payload) {
    let settled;
    worker.listeners.push({
        data: { json: () => payload, text: () => JSON.stringify(payload) },
        waitUntil: (p) => { settled = p; },
    });
    assert.ok(settled, 'the push handler must extend the event lifetime with waitUntil');
    await settled;
}

const escalation = (receipt = RECEIPT) => ({
    title: 'Reliability Escalation', body: 'Engine', url: '/hub/messenger', tag: 'reliability:x',
    data: { event: 'reliability_escalation', outboxId: RECEIPT.id, ...(receipt ? { receipt } : {}) },
});

for (const file of WORKERS) {
    test(`${file}: a displayed escalation is acknowledged once, after display`, async () => {
        const order = [];
        const worker = loadWorker(file, {
            showNotification: async () => { order.push('shown'); },
            fetchImpl: async (url) => { order.push(url); return { ok: true, status: 200 }; },
        });
        await dispatchPush(worker, escalation());
        const acks = worker.fetches.filter((f) => f.url === PATH);
        assert.equal(acks.length, 1);
        assert.deepEqual(JSON.parse(acks[0].init.body), { ...RECEIPT, stage: 'displayed' });
        assert.equal(acks[0].init.method, 'POST');
        assert.equal(acks[0].init.keepalive, true);
        assert.ok(order.indexOf('shown') < order.indexOf(PATH), 'acknowledged only after display');
        assert.equal(worker.fetches.filter((f) => f.url === '/api/push/receipt').length, 1, 'the endpoint receipt is unchanged');
    });

    test(`${file}: the minimal-options fallback still counts as displayed`, async () => {
        let calls = 0;
        const worker = loadWorker(file, {
            showNotification: async () => { calls += 1; if (calls === 1) throw new TypeError('options rejected'); },
        });
        await dispatchPush(worker, escalation());
        const acks = worker.fetches.filter((f) => f.url === PATH);
        assert.equal(acks.length, 1);
        assert.equal(JSON.parse(acks[0].init.body).stage, 'displayed');
    });

    test(`${file}: a banner the OS refused is acknowledged as received, not displayed`, async () => {
        const worker = loadWorker(file, { showNotification: async () => { throw new Error('refused'); } });
        await dispatchPush(worker, escalation());
        const acks = worker.fetches.filter((f) => f.url === PATH);
        assert.equal(acks.length, 1);
        assert.equal(JSON.parse(acks[0].init.body).stage, 'received');
    });

    test(`${file}: a failing acknowledgement never blocks or repeats the notification`, async () => {
        const worker = loadWorker(file, {
            fetchImpl: async (url) => { if (url === PATH) throw new Error('offline'); return { ok: true, status: 200 }; },
        });
        await dispatchPush(worker, escalation());
        assert.equal(worker.shown.length, 1);
        assert.equal(worker.fetches.filter((f) => f.url === PATH).length, 1, 'one attempt, no retry');
        const rejecting = loadWorker(file, { fetchImpl: async () => ({ ok: false, status: 404 }) });
        await dispatchPush(rejecting, escalation());
        assert.equal(rejecting.fetches.filter((f) => f.url === PATH).length, 1);
    });

    test(`${file}: a push without a valid receipt sends no acknowledgement`, async () => {
        for (const receipt of [null, { id: RECEIPT.id, token: 'short' }, { id: 5, token: RECEIPT.token }, 'x']) {
            const worker = loadWorker(file);
            await dispatchPush(worker, escalation(receipt));
            assert.equal(worker.shown.length, 1);
            assert.equal(worker.fetches.filter((f) => f.url === PATH).length, 0, JSON.stringify(receipt));
        }
    });
}
