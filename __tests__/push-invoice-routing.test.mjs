import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/push/sw.js', import.meta.url), 'utf8');
const invoice = '/hub/messenger?conversation=payee-invoice';

function worker({ current = 'https://smarter.poker/hub/messenger', failNavigation = false, cold = false, rejectOptions = false } = {}) {
    const listeners = new Map(), navigations = [], opened = [], shown = [];
    let focused = 0;
    const client = { url: current, async focus() { focused++; return client; }, async navigate(url) {
        navigations.push(url); if (failNavigation) throw Error('navigation refused'); client.url = url; return client;
    } };
    const self = {
        location: { origin: 'https://smarter.poker' }, navigator: {},
        addEventListener(name, fn) { listeners.set(name, fn); }, skipWaiting() {},
        registration: { async getNotifications() { return []; }, async showNotification(title, options) {
            shown.push({ title, options });
            if (rejectOptions && shown.length === 1) throw Error('unsupported image option');
        } },
        clients: { async claim() {}, async matchAll() { return cold ? [] : [client]; }, async openWindow(url) { opened.push(url); } },
    };
    runInNewContext(source, { self, URL, Date, console });
    async function event(name, values) {
        const promises = [];
        listeners.get(name)({ ...values, waitUntil(p) { promises.push(p); } });
        await Promise.all(promises);
    }
    return { navigations, opened, shown, focused: () => focused,
        click: url => event('notificationclick', { notification: { data: { url }, close() {} } }),
        push: data => event('push', { data: { json: () => data } }),
    };
}

test('an invoice click navigates an existing social Messenger to the exact conversation', async () => {
    const w = worker(); await w.click(invoice);
    assert.deepEqual(w.navigations, [invoice]); assert.equal(w.focused(), 1); assert.deepEqual(w.opened, []);
});
test('another invoice, club folder or hash on the same page is still a different destination', async () => {
    for (const current of ['https://smarter.poker/hub/messenger?conversation=other',
        'https://smarter.poker/hub/messenger?clubId=club-a&folder=invoices',
        `https://smarter.poker${invoice}#different`]) {
        const w = worker({ current }); await w.click(invoice); assert.deepEqual(w.navigations, [invoice]);
    }
});
test('the exact open invoice is focused without unnecessary navigation', async () => {
    const w = worker({ current: `https://smarter.poker${invoice}` }); await w.click(invoice);
    assert.deepEqual(w.navigations, []); assert.equal(w.focused(), 1);
});
test('a cold or refused existing window opens the exact invoice instead of silently focusing the wrong page', async () => {
    for (const options of [{ cold: true }, { failNavigation: true }]) {
        const w = worker(options); await w.click(invoice); assert.deepEqual(w.opened, [invoice]);
    }
});
test('notification fallback retains the invoice route and receipt tag for subsequent click and retry', async () => {
    const w = worker({ rejectOptions: true });
    await w.push({ title: 'Invoice', body: 'Issued', url: invoice, tag: 'accounting:receipt-one', renotify: false });
    assert.equal(w.shown.length, 2);
    const fallback = w.shown[1].options;
    assert.equal(fallback.data.url, invoice); assert.equal(fallback.tag, 'accounting:receipt-one'); assert.equal(fallback.renotify, false);
    await w.click(fallback.data.url); assert.deepEqual(w.navigations, [invoice]);
});
