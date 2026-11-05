// Player campaigns send through the Pro Resend account and its verified
// mail.smarter.poker domain (2026-11-05): the original key is a Free-plan
// account capped at 100 a day, and the Pro account cannot send from the root
// domain. Key and domain must always travel together.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendBulkEmail } from '../src/lib/dailyDigest/delivery.mjs';

function capture() {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body), idem: init.headers['Idempotency-Key'] });
        return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
    };
    return { calls, fetchImpl };
}

function withEnv(vars, fn) {
    const saved = {};
    for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
    return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}

test('with the bulk key, a campaign uses that key and the mail. domain, keeping the display name', () => withEnv(
    { RESEND_API_KEY: 'old-key', RESEND_BULK_API_KEY: 'pro-key', RESEND_BULK_FROM_EMAIL: undefined },
    async () => {
        const { calls, fetchImpl } = capture();
        const r = await sendBulkEmail({ to: ['p@example.com'], subject: 's', text: 't', html: 'h', from: 'Smarter.Poker <noreply@smarter.poker>', idempotencyKey: 'k1', fetchImpl });
        assert.equal(r.ok, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].auth, 'Bearer pro-key');
        assert.equal(calls[0].body.from, 'Smarter.Poker <noreply@mail.smarter.poker>');
        assert.equal(calls[0].idem, 'k1');
    },
));

test('RESEND_BULK_FROM_EMAIL overrides the bulk sender address', () => withEnv(
    { RESEND_BULK_API_KEY: 'pro-key', RESEND_BULK_FROM_EMAIL: 'hello@mail.smarter.poker' },
    async () => {
        const { calls, fetchImpl } = capture();
        await sendBulkEmail({ to: ['p@example.com'], subject: 's', text: 't', html: 'h', from: 'Smarter.Poker <noreply@smarter.poker>', fetchImpl });
        assert.equal(calls[0].body.from, 'Smarter.Poker <hello@mail.smarter.poker>');
    },
));

test('without the bulk key, nothing changes: original key and the caller sender', () => withEnv(
    { RESEND_API_KEY: 'old-key', RESEND_BULK_API_KEY: undefined },
    async () => {
        const { calls, fetchImpl } = capture();
        await sendBulkEmail({ to: ['p@example.com'], subject: 's', text: 't', html: 'h', from: 'Smarter.Poker <noreply@smarter.poker>', fetchImpl });
        assert.equal(calls[0].auth, 'Bearer old-key');
        assert.equal(calls[0].body.from, 'Smarter.Poker <noreply@smarter.poker>');
    },
));

test('the hourly campaign route hands all three campaigns the bulk sender', () => {
    const src = fs.readFileSync(new URL('../pages/api/cron/signup-welcome-back.js', import.meta.url), 'utf8');
    assert.match(src, /runWelcomeBack\(sb, \{ limit, sendEmail: sendBulkEmail/);
    assert.match(src, /runRelaunchNotice\(sb, \{ sendEmail: sendBulkEmail/);
    assert.match(src, /runPlayerAnnouncements\(sb, \{ sendEmail: sendBulkEmail/);
});
