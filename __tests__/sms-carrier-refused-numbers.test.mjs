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
import { filterSuppressedPhones, sendSms } from '../src/lib/dailyDigest/delivery.mjs';
import { importMarketingLeads, resolvePromoAudience } from '../src/lib/promoCampaigns/dispatch.mjs';

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

test('a code the carrier refused is reported to the player in title case', async () => {
    const { codeNotDeliveredMessage } = await import('../src/lib/sms/codeDelivery.mjs');
    const msg = codeNotDeliveredMessage('number unknown or blocked by the carrier');
    assert.equal(msg, 'Your Code Did Not Reach Your Phone (Number Unknown Or Blocked By The Carrier). Check The Number Or Send A New Code.');
    for (const word of msg.replace(/[().]/g, '').split(/\s+/)) assert.match(word, /^[A-Z]/);
});

test('the code status answer reveals only the delivery state', async () => {
    const { otpDeliveryAnswer } = await import('../src/lib/sms/codeDelivery.mjs');
    assert.deepEqual(otpDeliveryAnswer(null), { state: 'pending' });
    assert.deepEqual(otpDeliveryAnswer({ status: 'sent', error_code: null }), { state: 'pending' });
    assert.deepEqual(otpDeliveryAnswer({ status: 'delivered', error_code: null }), { state: 'delivered' });
    assert.deepEqual(otpDeliveryAnswer({ status: 'undelivered', error_code: 30007 }), { state: 'not_delivered', reason: 'filtered by the carrier as spam' });
});

test('the verify screen watches the code it sent and offers a resend on a refusal', () => {
    const src = readFileSync(new URL('../pages/hub/verify-phone.js', import.meta.url), 'utf8');
    assert.match(src, /if \(data\.messageId\) watchCodeDelivery\(data\.messageId\)/);
    assert.match(src, /\/api\/sms\/otp-status\?sid=/);
    assert.match(src, /setError\(codeNotDeliveredMessage\(answer\.reason\)\);\s*setCooldown\(0\);/);
    const send = readFileSync(new URL('../pages/api/sms/send-otp.js', import.meta.url), 'utf8');
    assert.match(send, /messageId: message\?\.sid \|\| null/);
});

test('filterSuppressedPhones chunks candidates and reads fn_sms_filter_suppressed_phones', async () => {
    const calls = [];
    const sb = {
        async rpc(fn, params) {
            calls.push({ fn, phones: params.p_phones });
            return { data: params.p_phones.filter((p) => p.endsWith('0006')), error: null };
        },
    };
    const res = await filterSuppressedPhones(
        sb,
        ['+15025550006', '+15025550001', '+15025550006', '+15025560006'],
        { chunkSize: 2 }
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].fn, 'fn_sms_filter_suppressed_phones');
    assert.deepEqual([...res].sort(), ['+15025550006', '+15025560006']);
});

test('importMarketingLeads skips carrier-suppressed phones without inserting them into newsletter_subscribers', async () => {
    const inserted = [];
    const sb = {
        async rpc(fn, params) {
            if (fn === 'fn_sms_filter_suppressed_phones') {
                return { data: params.p_phones.filter((p) => p === '+15025550006'), error: null };
            }
            return { data: [], error: null };
        },
        from(table) {
            assert.equal(table, 'newsletter_subscribers');
            return {
                select() {
                    return {
                        async in() {
                            return { data: [], error: null };
                        },
                    };
                },
                async insert(rows) {
                    inserted.push(...rows);
                    return { error: null };
                },
            };
        },
    };
    const summary = await importMarketingLeads(sb, {
        phones: ['+15025550006', '+15025550009'],
        source: 'commander_import',
    });
    assert.equal(summary.importedPhones, 1);
    assert.equal(summary.optedOutPreserved, 1);
    assert.deepEqual(
        inserted.map((r) => r.email),
        ['sms:+15025550009']
    );
});

test('resolvePromoAudience excludes carrier-suppressed commander_members phones even when sms_delivery_receipts.to_number is blanked', async () => {
    const tables = {
        newsletter_subscribers: [],
        notification_preferences: [],
        // Production trigger blanks to_number on 30006/30005 receipts; old reader missed these.
        sms_delivery_receipts: [{ to_number: null, status: 'undelivered', error_code: 30006 }],
        profiles: [],
        commander_members: [
            { id: '1', email: null, phone: '+15025550006' },
            { id: '2', email: null, phone: '+15025550099' },
        ],
        commander_onboarding_leads: [],
        commander_leads: [],
        commander_home_members: [],
    };
    const makeQuery = (rows) => {
        const q = {
            select() { return q; },
            eq() { return q; },
            in() { return q; },
            or() { return q; },
            not() { return q; },
            order() { return q; },
            async range(from, to) {
                return { data: rows.slice(from, to + 1), error: null };
            },
        };
        return q;
    };
    const sb = {
        async rpc(fn, params) {
            if (fn === 'fn_sms_filter_suppressed_phones') {
                return { data: params.p_phones.filter((p) => p === '+15025550006'), error: null };
            }
            return { data: [], error: null };
        },
        from(table) {
            return makeQuery(tables[table] || []);
        },
    };
    const audience = await resolvePromoAudience(sb, { scope: 'all' });
    assert.deepEqual(audience.phones, ['+15025550099']);
});

test('lifecycleEngine wires filterSuppressedPhones against hashed carrier suppressions', () => {
    const src = readFileSync(new URL('../src/lib/promoCampaigns/lifecycleEngine.mjs', import.meta.url), 'utf8');
    assert.match(src, /import\s*\{[^}]*filterSuppressedPhones[^}]*\}\s*from\s*'\.\.\/dailyDigest\/delivery\.mjs'/);
    assert.match(src, /await filterSuppressedPhones\(supabase,\s*candidateLifecyclePhones\)/);
});
