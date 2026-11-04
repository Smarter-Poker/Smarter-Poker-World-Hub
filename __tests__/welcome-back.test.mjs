// Welcome-back chips (Dan 2026-11-04): the hourly job pays through the database,
// then mails and texts every awarded player and records each channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runWelcomeBack, welcomeBackEmail, welcomeBackSms, sendablePhone } from '../src/lib/welcomeBack/run.mjs';

const AWARDED = [
    { user_id: 'u1', username: 'Philivey', email: 'phil@example.com', phone: '+13125550001', phone_verified: true, club_id: 'kings', club: 'KINGS CLUB', amount: 25, op_id: 'op1', replayed: false },
    { user_id: 'u2', username: 'Breezy', email: 'breezy@example.com', phone: null, phone_verified: false, club_id: 'kings', club: 'KINGS CLUB', amount: 25, op_id: 'op2', replayed: false },
];

function fakeDb({ run, pending = [], profiles = [], clubs = [] }) {
    const calls = { rpc: [], marks: [] };
    const table = (name) => {
        const q = { _name: name, _filters: [] };
        for (const m of ['select', 'eq', 'gte', 'or', 'limit', 'in']) q[m] = (...a) => { q._filters.push([m, ...a]); return q; };
        q.then = (resolve) => resolve({ data: name === 'sp_signup_welcome_back_awards' ? pending : name === 'profiles' ? profiles : clubs, error: null });
        return q;
    };
    const sb = {
        rpc: async (name, args) => {
            calls.rpc.push([name, args]);
            if (name === 'fn_sp_signup_welcome_back_run') return { data: run, error: null };
            if (name === 'fn_sp_signup_welcome_back_mark') { calls.marks.push(args); return { data: null, error: null }; }
            return { data: null, error: { message: `unknown ${name}` } };
        },
        from: table,
    };
    return { sb, calls };
}

test('every awarded player gets an email and, with a phone on file, a text; both receipts are recorded', async () => {
    const run = { awarded: AWARDED, awarded_count: 2, no_club: [{ username: 'TheSAUCE' }], no_club_count: 1, failed: [], failed_count: 0, union_promo_wallet_after: 133677.9 };
    const { sb, calls } = fakeDb({ run });
    const emails = [], texts = [];
    const summary = await runWelcomeBack(sb, {
        limit: 50,
        sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; },
        sendSms: async (body, o) => { texts.push([body, o]); return { ok: true, id: 's' }; },
    });
    assert.equal(calls.rpc[0][0], 'fn_sp_signup_welcome_back_run');
    assert.deepEqual(calls.rpc[0][1], { p_limit: 50 });
    assert.equal(summary.awarded, 2);
    assert.equal(summary.no_club, 1);
    assert.equal(summary.union_promo_wallet_after, 133677.9);
    assert.equal(emails.length, 2);
    assert.deepEqual(emails[0].to, ['phil@example.com']);
    assert.equal(emails[0].idempotencyKey, 'welcome-back-u1');
    assert.match(emails[0].subject, /25 free chips are waiting for you, Philivey/);
    assert.match(emails[0].html, /KINGS CLUB/);
    assert.equal(texts.length, 1, 'Breezy has no phone, so no text');
    assert.equal(texts[0][1].to, '+13125550001');
    assert.match(texts[0][0], /25 free chips from the Midway Union/);
    assert.deepEqual(calls.marks, [
        { p_user_id: 'u1', p_channel: 'email', p_ok: true, p_detail: null },
        { p_user_id: 'u1', p_channel: 'sms', p_ok: true, p_detail: null },
        { p_user_id: 'u2', p_channel: 'email', p_ok: true, p_detail: null },
    ]);
    assert.equal(summary.emails_sent, 2);
    assert.equal(summary.texts_sent, 1);
    assert.equal(summary.texts_skipped_no_phone, 1);
    assert.equal(summary.players[1].text, 'no phone');
});

test('a channel failure is recorded with its reason and does not stop the other channel or the other players', async () => {
    const run = { awarded: AWARDED, awarded_count: 2, no_club: [], no_club_count: 0, failed: [], failed_count: 0 };
    const { sb, calls } = fakeDb({ run });
    const summary = await runWelcomeBack(sb, {
        sendEmail: async (m) => (m.to[0] === 'phil@example.com' ? { ok: false, error: 'resend 422: bad address' } : { ok: true, id: 'e' }),
        sendSms: async () => ({ ok: true, id: 's' }),
    });
    assert.equal(summary.emails_failed, 1);
    assert.equal(summary.emails_sent, 1);
    assert.equal(summary.texts_sent, 1);
    assert.deepEqual(calls.marks[0], { p_user_id: 'u1', p_channel: 'email', p_ok: false, p_detail: 'resend 422: bad address' });
    assert.match(summary.players[0].email, /failed: resend 422/);
});

test('an award whose email or text never went out is picked up on the next run', async () => {
    const run = { awarded: [], awarded_count: 0, no_club: [], no_club_count: 0, failed: [], failed_count: 0 };
    const pending = [
        { user_id: 'u9', email: 'nine@example.com', phone: '3125550009', club_id: 'kings', amount: 25, email_sent_at: null, sms_sent_at: null, email_error: null, sms_error: null, awarded_at: new Date(Date.now() - 3600000).toISOString() },
        { user_id: 'u8', email: 'eight@example.com', phone: null, club_id: 'kings', amount: 25, email_sent_at: null, sms_sent_at: null, email_error: 'resend 500', sms_error: null, awarded_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    ];
    const { sb, calls } = fakeDb({ run, pending, profiles: [{ id: 'u9', username: 'Nine' }], clubs: [{ id: 'kings', name: 'KINGS CLUB' }] });
    const emails = [], texts = [];
    const summary = await runWelcomeBack(sb, {
        sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; },
        sendSms: async (b, o) => { texts.push(o.to); return { ok: true, id: 's' }; },
    });
    assert.equal(summary.retried, 1, 'u8 failed three days ago and is not retried; u9 is');
    assert.deepEqual(emails.map((e) => e.to[0]), ['nine@example.com']);
    assert.match(emails[0].subject, /Nine/);
    assert.deepEqual(texts, ['+13125550009']);
    assert.equal(calls.marks.length, 2);
    assert.equal(summary.players[0].source, 'retry');
});

test('a database error from the run is surfaced, never swallowed', async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }), from: () => ({}) };
    await assert.rejects(runWelcomeBack(sb, { sendEmail: async () => ({ ok: true }), sendSms: async () => ({ ok: true }) }), /fn_sp_signup_welcome_back_run: canceling statement/);
});

test('phones are dialled as E.164 and junk is skipped', () => {
    assert.equal(sendablePhone('(312) 555-0001'), '+13125550001');
    assert.equal(sendablePhone('+1 312 555 0001'), '+13125550001');
    assert.equal(sendablePhone('447700900123'), '+447700900123');
    assert.equal(sendablePhone('12345'), null);
    assert.equal(sendablePhone(null), null);
});

test('the messages name the club, the amount and the link, and the email escapes names', () => {
    const e = welcomeBackEmail({ username: '<b>Phil</b>', club: 'KINGS CLUB' });
    assert.match(e.html, /&lt;b&gt;Phil&lt;\/b&gt;/);
    assert.match(e.text, /25 free chips to your KINGS CLUB wallet/);
    assert.match(e.html, /https:\/\/smarter\.poker\/hub\/club-arena\//);
    assert.doesNotMatch(e.html + e.text + e.subject, /—/, 'no em dashes in player-facing text');
    assert.match(welcomeBackSms({ username: 'Phil', club: 'KINGS CLUB' }), /^Smarter\.Poker: Phil, 25 free chips/);
});

test('the route is a CRON_SECRET job and the dispatcher runs it hourly off the top of the hour', () => {
    const route = fs.readFileSync(new URL('../pages/api/cron/signup-welcome-back.js', import.meta.url), 'utf8');
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /withCronHealth\('signup-welcome-back'/);
    assert.match(route, /runWelcomeBack\(sb, \{ limit, sendEmail, sendSms/);
    const dispatcher = fs.readFileSync(new URL('../scripts/openclaw-cron-dispatcher.py', import.meta.url), 'utf8');
    assert.match(dispatcher, /\('\/api\/cron\/signup-welcome-back',\s+dict\(minute=17\)\)/);
    const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.ok(!(vercel.crons || []).some((c) => String(c.path).includes('signup-welcome-back')), 'never a vercel.json cron');
});
