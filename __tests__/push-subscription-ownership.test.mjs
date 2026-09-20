import test from 'node:test';
import assert from 'node:assert/strict';
import { changePushSubscription } from '../src/lib/push/subscription-ownership.mjs';

const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const subscription = { endpoint: 'https://fcm.googleapis.com/fixture-device', transport: 'webpush', p256dh: 'fixture-key', auth: 'fixture-secret' };
const receipt = { schema_version: 1, success: true, user_id: user, endpoint: subscription.endpoint, enabled: true, displaced_user_ids: [other] };

test('enrollment uses one service contract with the verified actor and authoritative displaced recipients', async () => {
    const calls = [];
    const db = { async rpc(name, args) { calls.push({ name, args }); return { data: receipt, error: null }; } };
    assert.equal(await changePushSubscription(db, user, subscription, true), receipt);
    assert.deepEqual(calls, [{ name: 'fn_change_push_subscription_ownership', args: { p_user_id: user, p_subscription: subscription, p_enabled: true } }]);
});

test('an unavailable RPC never falls back to separate subscription or preference writes', async () => {
    for (const error of [{ code: '42883' }, { code: '57014' }, { code: '23505' }]) {
        const db = { async rpc() { return { data: null, error }; }, from() { assert.fail('partial enrollment fallback'); } };
        await assert.rejects(changePushSubscription(db, user, subscription, true), e => e.status === 503);
    }
});

test('wrong account, endpoint, outcome and incomplete receipts never claim enrollment success', async () => {
    for (const data of [null, {}, { ...receipt, success: false }, { ...receipt, user_id: other },
        { ...receipt, endpoint: 'another-device' }, { ...receipt, enabled: false },
        { ...receipt, displaced_user_ids: null }, { ...receipt, displaced_user_ids: [user] }]) {
        await assert.rejects(changePushSubscription({ async rpc() { return { data }; } }, user, subscription, true), e => e.status === 503);
    }
});

test('a stored possession mismatch is a conflict, not successful takeover', async () => {
    const db = { async rpc() { return { error: { code: '23514', message: 'push_subscription_possession_mismatch' } }; } };
    await assert.rejects(changePushSubscription(db, user, subscription, true), e => e.status === 409);
});

test('deactivation also requires its exact atomic receipt and never enables preferences', async () => {
    const db = { async rpc(name, args) {
        assert.equal(name, 'fn_change_push_subscription_ownership');
        assert.equal(args.p_enabled, false);
        assert.deepEqual(args.p_subscription, { endpoint: subscription.endpoint });
        return { data: { ...receipt, enabled: false, displaced_user_ids: [] } };
    } };
    assert.equal((await changePushSubscription(db, user, { endpoint: subscription.endpoint }, false)).enabled, false);
});
