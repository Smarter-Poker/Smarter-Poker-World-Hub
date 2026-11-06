// Carrier-refused numbers (Dan, 2026-11-06: "REMOVE THE TWO BLOCKED NUMBERS
// FROM THE DATABASE ... HARDEN THEM TO PREVENT FUTURE REGRESSIONS"). Two texts
// on 2026-11-05 came back 30005 and the platform kept texting those numbers.
// The database trigger (Club Arena migration 20261106203917) now suppresses a
// permanently refused number and removes it everywhere; these pin the two
// World Hub doors: a player text refuses a suppressed number, and a
// verification code asks Twilio for its carrier result like every other text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendSms } from '../src/lib/dailyDigest/delivery.mjs';

const TWILIO = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_PHONE_NUMBER: '+18885550000' };

test('a player text to a suppressed number is refused before Twilio is called', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, TWILIO);
    let called = false;
    const r = await sendSms('hi', {
        to: '+17085550100',
        suppressionCheck: async () => true,
        fetchImpl: async () => { called = true; return { ok: true, json: async () => ({ sid: 'SM1' }) }; },
    });
    process.env = saved;
    assert.equal(called, false);
    assert.equal(r.ok, false);
    assert.equal(r.suppressed, true);
});

test('a number that is not suppressed is texted', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, TWILIO);
    const r = await sendSms('hi', {
        to: '+17085550100',
        suppressionCheck: async () => false,
        fetchImpl: async () => ({ ok: true, json: async () => ({ sid: 'SM2' }) }),
    });
    process.env = saved;
    assert.deepEqual(r, { ok: true, id: 'SM2' });
});

test('the owner page is never held by the player suppression list', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, TWILIO, { DIGEST_ALERT_PHONE: '+17085550199' });
    let checked = false;
    const r = await sendSms('page', {
        suppressionCheck: async () => { checked = true; return true; },
        fetchImpl: async () => ({ ok: true, json: async () => ({ sid: 'SM3' }) }),
    });
    process.env = saved;
    assert.equal(checked, false);
    assert.equal(r.ok, true);
});

test('a verification code asks for its carrier result and logs the message id', () => {
    const src = readFileSync(new URL('../pages/api/sms/send-otp.js', import.meta.url), 'utf8');
    assert.match(src, /statusCallback:\s*smsStatusCallbackUrl\(\)/);
    assert.match(src, /logSendAttempt\(supabase, 'sent', null, message\?\.sid\)/);
    assert.match(src, /twilio_sid:/);
});
