import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingDisplayPayload } from '../src/lib/push/accounting-display.mjs';
import { buildWebPushPayload } from '../src/lib/push/web-push.js';
import { buildFcmMessage } from '../src/lib/push/fcm.js';

const receipt = '00000000-0000-4000-8000-000000000008';
const invoiceUrl = '/hub/messenger?conversation=conversation-8&clubId=club-8&folder=invoices';
const privatePayload = () => ({
    title: 'PRIVATE-CLUB Invoice CA-2026-87654', body: 'PRIVATE-PAYEE Received 985.76 Chips',
    url: invoiceUrl, tag: `accounting:${receipt}`, renotify: true,
    image: 'https://example.invalid/PRIVATE-INVOICE.png', icon: 'https://example.invalid/PRIVATE-CLUB.png',
    badge: 'https://example.invalid/PRIVATE-PAYEE.png', badgeCount: 87654,
    actions: [{ action: 'view', title: 'PRIVATE-PAYEE 985.76' }],
    data: { event: 'accounting_invoice', accountingNotificationId: receipt, outboxId: 'outbox-8',
        title: 'PRIVATE-PAYEE', body: '985.76', image: 'PRIVATE-INVOICE', invoiceNumber: 'CA-2026-87654',
        url: '/PRIVATE-OVERRIDE', notification: { body: 'PRIVATE-NATIVE-FALLBACK' } },
});
test('the Web Push serialization boundary removes accounting details even from an unsanitized caller', () => {
    const raw = privatePayload(), payload = buildWebPushPayload(raw);
    assert.equal(payload.title, 'New Accounting Notice'); assert.equal(payload.body, 'Open Smarter Poker To View');
    assert.equal(payload.url, invoiceUrl); assert.equal(payload.tag, raw.tag); assert.equal(payload.renotify, false);
    assert.equal(payload.image, undefined); assert.equal(payload.actions, undefined); assert.equal(payload.badgeCount, undefined);
    assert.equal(payload.data.accountingNotificationId, receipt); assert.equal(payload.data.outboxId, 'outbox-8');
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE-|985\.76|CA-2026-87654/);
    assert.match(raw.body, /PRIVATE-PAYEE/);
});
test('FCM Android, APNs and custom data cannot reintroduce private invoice text or images', () => {
    const payload = buildFcmMessage('fixture-token', privatePayload()).message;
    assert.deepEqual(payload.notification, { title: 'New Accounting Notice', body: 'Open Smarter Poker To View' });
    assert.equal(payload.data.url, invoiceUrl); assert.equal(payload.data.accountingNotificationId, receipt);
    assert.equal(payload.android.notification.tag, `accounting:${receipt}`);
    assert.equal(payload.apns.headers['apns-collapse-id'], `accounting:${receipt}`);
    assert.equal(payload.android.notification.image, undefined); assert.equal(payload.apns.payload.aps.badge, undefined);
    assert.equal(payload.data.image, undefined); assert.equal(payload.data.notification, undefined);
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE-|985\.76|CA-2026-87654/);
});
test('flat legacy event and receipt-only markers restrict display without conferring accounting authority', () => {
    for (const marker of [{ event: 'accounting_invoice' }, { accountingNotificationId: receipt },
        { data: { accountingNotificationId: receipt } }, { tag: `accounting:${receipt}` }]) {
        const payload = { title: 'PRIVATE-PAYEE', body: '985.76', url: invoiceUrl, ...marker };
        assert.equal(buildWebPushPayload(payload).body, 'Open Smarter Poker To View');
        assert.equal(buildFcmMessage('fixture-token', payload).message.notification.body, 'Open Smarter Poker To View');
    }
});
test('ordinary social or game notifications retain their existing presentation', () => {
    const payload = { title: 'Seat Open', body: 'Your Seat Is Ready', url: '/hub/club-arena/table/1', tag: 'seat:1',
        image: 'https://example.invalid/table.png', data: { event: 'waitlist_seat_open', tableId: '1' } };
    assert.equal(accountingDisplayPayload(payload), payload);
    assert.equal(buildWebPushPayload(payload).body, payload.body);
    assert.equal(buildFcmMessage('fixture-token', payload).message.notification.image, payload.image);
});
