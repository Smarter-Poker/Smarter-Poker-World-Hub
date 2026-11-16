import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverWeeklyRakebackEmails } from '../src/lib/email/weeklyRakeback.mjs';

test('one posted wallet receipt addresses exactly its verified recipient and keeps its provider retry key', async () => {
    const row = { receipt_id: 'credit-1', claim: 'lease-1', address: 'human@example.org', title: 'Player rakeback credited', body: 'Club credited 25.00 chips.' };
    const sends = [], acknowledgments = [];
    let pending = [row];
    const db = { rpc: async (name, args) => {
        if (name === 'claim_weekly_rakeback_credit_emails') return { data: pending };
        acknowledgments.push(args);
        if (args.p_provider_id) pending = [];
        return { data: true };
    }};
    const send = async input => { sends.push(input); return sends.length === 1 ? { ok: false } : { ok: true, id: 'provider-id' }; };
    assert.deepEqual(await deliverWeeklyRakebackEmails(db, send), { sent: 0, unconfirmed: 1 });
    assert.deepEqual(await deliverWeeklyRakebackEmails(db, send), { sent: 1, unconfirmed: 0 });
    assert.deepEqual(await deliverWeeklyRakebackEmails(db, send), { sent: 0, unconfirmed: 0 });
    assert.equal(sends.length, 2);
    assert.deepEqual(sends[0], sends[1]);
    assert.deepEqual(sends[1].to, ['human@example.org']);
    assert.equal(sends[1].idempotencyKey, 'weekly-rakeback/credit-1');
    assert.equal(acknowledgments[1].p_provider_id, 'provider-id');
    assert.equal(acknowledgments[0].p_provider_id, null);
});
