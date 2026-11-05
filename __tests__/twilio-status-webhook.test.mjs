// Delivery receipts (Dan, 2026-11-05): texts were recorded as "sent" on
// Twilio's acceptance alone. Pins the signature check the receipt webhook
// relies on, and that every text asks Twilio for its carrier result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { twilioSignature, signatureValid } from '../src/lib/sms/twilioSignature.mjs';
import { sendSms, smsStatusCallbackUrl } from '../src/lib/dailyDigest/delivery.mjs';

const URL_ = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const PARAMS = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };

test("signature matches Twilio's published example", () => {
    assert.equal(twilioSignature('12345', URL_, PARAMS), '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
});

test('a tampered field, wrong token or missing header is refused', () => {
    assert.equal(signatureValid('12345', URL_, PARAMS, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), true);
    assert.equal(signatureValid('12345', URL_, { ...PARAMS, Digits: '9999' }, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), false);
    assert.equal(signatureValid('other', URL_, PARAMS, '0/KCTR6DLpKmkAf8muzZqo1nDgQ='), false);
    assert.equal(signatureValid('12345', URL_, PARAMS, undefined), false);
    assert.equal(signatureValid('', URL_, PARAMS, 'x'), false);
});

test('every text asks Twilio to report its carrier result', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_PHONE_NUMBER: '+18885550000' });
    delete process.env.TWILIO_STATUS_CALLBACK_URL; delete process.env.DIGEST_PUBLIC_BASE_URL;
    let body = '';
    const r = await sendSms('hi', { to: '+17085550100', fetchImpl: async (_u, o) => { body = o.body; return { ok: true, json: async () => ({ sid: 'SM1' }) }; } });
    process.env = saved;
    assert.equal(r.ok, true);
    assert.equal(new URLSearchParams(body).get('StatusCallback'), 'https://smarter.poker/api/webhooks/twilio-status');
    assert.equal(smsStatusCallbackUrl().endsWith('/api/webhooks/twilio-status'), true);
});
