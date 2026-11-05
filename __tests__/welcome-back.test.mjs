// Welcome-back chips (Dan 2026-11-04): the hourly job pays through the database,
// then mails and texts every awarded player and records each channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runWelcomeBack, welcomeBackEmail, welcomeBackSms, sendablePhone, WELCOME_BACK_FROM, PENDING_CHANNEL_FILTER } from '../src/lib/welcomeBack/run.mjs';

const AWARDED = [
    { user_id: 'u1', username: 'Philivey', email: 'phil@example.com', phone: '+13125550001', phone_verified: true, club_id: 'kings', club: 'KINGS CLUB', amount: 25, op_id: 'op1', replayed: false },
    { user_id: 'u2', username: 'Breezy', email: 'breezy@example.com', phone: null, phone_verified: false, club_id: 'kings', club: 'KINGS CLUB', amount: 25, op_id: 'op2', replayed: false },
];

function fakeDb({ run, pending = [], profiles = [], clubs = [] }) {
    const calls = { rpc: [], marks: [], queries: [] };
    const table = (name) => {
        const q = { _name: name, _filters: [] };
        for (const m of ['select', 'eq', 'gte', 'or', 'order', 'limit', 'in']) q[m] = (...a) => { q._filters.push([m, ...a]); calls.queries.push([name, m, ...a]); return q; };
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
    assert.equal(emails[0].from, WELCOME_BACK_FROM, 'players hear from noreply@, not the owner alerts address');
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
        { user_id: 'u8', email: 'eight@example.com', phone: null, club_id: 'kings', amount: 25, email_sent_at: null, sms_sent_at: null, email_error: 'resend 500', sms_error: null, awarded_at: new Date(Date.now() - 3 * 86400000).toISOString(), updated_at: new Date(Date.now() - 2 * 3600000).toISOString() },
        { user_id: 'u7', email: null, phone: '12345', club_id: 'kings', amount: 25, email_sent_at: null, sms_sent_at: null, email_error: null, sms_error: 'phone number cannot be dialed', awarded_at: new Date(Date.now() - 3600000).toISOString() },
        { user_id: 'u6', email: 'six@example.com', phone: null, club_id: 'kings', amount: 25, email_sent_at: null, sms_sent_at: null, email_error: 'resend 500', sms_error: null, awarded_at: new Date(Date.now() - 3 * 86400000).toISOString(), updated_at: new Date(Date.now() - 30 * 3600000).toISOString() },
    ];
    const { sb, calls } = fakeDb({ run, pending, profiles: [{ id: 'u9', username: 'Nine' }], clubs: [{ id: 'kings', name: 'KINGS CLUB' }] });
    const emails = [], texts = [];
    const summary = await runWelcomeBack(sb, {
        sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; },
        sendSms: async (b, o) => { texts.push(o.to); return { ok: true, id: 's' }; },
    });
    assert.equal(summary.retried, 2, 'u9 is fresh; u6 failed days ago but has been quiet for a day so gets its daily try; u8 was tried two hours ago and u7 has an undialable number');
    assert.deepEqual(emails.map((e) => e.to[0]).sort(), ['nine@example.com', 'six@example.com']);
    const pendingQuery = calls.queries.filter((q) => q[0] === 'sp_signup_welcome_back_awards');
    assert.ok(pendingQuery.some((q) => q[1] === 'or' && q[2] === PENDING_CHANNEL_FILTER), 'the PostgREST filter is the exported one');
    assert.ok(pendingQuery.some((q) => q[1] === 'order' && q[2] === 'awarded_at' && q[3]?.ascending === false), 'newest awards first');
    assert.match(emails[0].subject, /Nine/);
    assert.deepEqual(texts, ['+13125550009']);
    assert.equal(calls.marks.length, 3);
    assert.equal(summary.players[0].source, 'retry');
});

test('a receipt that fails to record is tried twice before it is given up as an error', async () => {
    const run = { awarded: [AWARDED[1]], awarded_count: 1, no_club: [], no_club_count: 0, failed: [], failed_count: 0 };
    const { sb, calls } = fakeDb({ run });
    let markCalls = 0;
    const origRpc = sb.rpc;
    sb.rpc = async (name, args) => { if (name === 'fn_sp_signup_welcome_back_mark') { markCalls++; return { data: null, error: { message: 'pool exhausted' } }; } return origRpc(name, args); };
    const summary = await runWelcomeBack(sb, { sendEmail: async () => ({ ok: true, id: 'e' }), sendSms: async () => ({ ok: true }) });
    assert.equal(markCalls, 2);
    assert.match(summary.errors[0], /mark email u2: pool exhausted/);
    assert.equal(calls.marks.length, 0);
});

test('a database error from the run is surfaced, never swallowed', async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }), from: () => ({}) };
    await assert.rejects(runWelcomeBack(sb, { sendEmail: async () => ({ ok: true }), sendSms: async () => ({ ok: true }) }), /fn_sp_signup_welcome_back_run: canceling statement/);
});

test('phones are dialled as E.164 and junk is skipped', () => {
    assert.equal(sendablePhone('(312) 555-0001'), '+13125550001');
    assert.equal(sendablePhone('+1 312 555 0001'), '+13125550001');
    assert.equal(sendablePhone('447700900123'), '+447700900123');
    assert.equal(sendablePhone('07700900123'), null, 'a trunk-zero national number cannot be dialed from here');
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
    assert.match(welcomeBackSms({ username: 'Phil', club: 'KINGS CLUB' }), /Reply STOP to opt out\.$/);
});

test('the route is a CRON_SECRET job and the dispatcher runs it hourly off the top of the hour', () => {
    const route = fs.readFileSync(new URL('../pages/api/cron/signup-welcome-back.js', import.meta.url), 'utf8');
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /withCronHealth\('signup-welcome-back'/);
    assert.match(route, /runWelcomeBack\(sb, \{ limit, sendEmail: sendBulkEmail, sendSms/);
    const dispatcher = fs.readFileSync(new URL('../scripts/openclaw-cron-dispatcher.py', import.meta.url), 'utf8');
    assert.match(dispatcher, /\('\/api\/cron\/signup-welcome-back',\s+dict\(minute=17\)\)/);
    assert.match(dispatcher, /'\/api\/cron\/signup-welcome-back':\s+300,/, 'the dispatcher gives the job the same 300s the route has');
    assert.match(dispatcher, /CRITICAL_JOBS\s*=\s*\{[\s\S]*?'\/api\/cron\/signup-welcome-back':\s+3,/, 'three failed hours page the owner');
    assert.match(route, /maxDuration: 300/);
    assert.match(route, /summary\.wallet_empty \|\| summary\.failed_new > 0/, 'an empty wallet or a player who first failed this run is not a 200');
    assert.match(route, /res\.status\(503\)/);
    assert.doesNotMatch(route, /summary\.failed > 0\) return res\.status\(503\)/, 'one stuck player must not page every hour forever');
    assert.match(route, /Number\(req\.query\?\.limit\) \|\| 50, 60\)/, 'at most 60 disbursements per run');
    const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.ok(!(vercel.crons || []).some((c) => String(c.path).includes('signup-welcome-back')), 'never a vercel.json cron');
});

// ── Enhancements (Dan 2026-11-04 13:02): nudges, settings, scoreboard ──────────
import { clubNudgeEmail, clubNudgeSms, playNudgeEmail, playNudgeSms, PENDING_NUDGE_FILTER } from '../src/lib/welcomeBack/run.mjs';

test('the join-a-club nudge carries the club code and referral code, by email and text, and is recorded per channel', async () => {
    const run = { awarded: [], awarded_count: 0, no_club: [], no_club_count: 0, failed: [], failed_count: 0, amount: 25,
        club_nudges: [{ user_id: 'n1', username: 'TheSAUCE', email: 'sauce@example.com', phone: '+13125550099', club_code: '25450', club: 'KINGS CLUB', referral_code: '1002337', referrer: 'kingfish', amount: 25 }], club_nudge_count: 1,
        play_nudges: [{ user_id: 'n2', username: 'Nena', email: 'nena@example.com', phone: null, club: 'KINGS CLUB', amount: 25 }], play_nudge_count: 1 };
    const { sb, calls } = fakeDb({ run });
    const emails = [], texts = [];
    const summary = await runWelcomeBack(sb, {
        sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; },
        sendSms: async (b, o) => { texts.push([b, o.to]); return { ok: true, id: 's' }; },
    });
    assert.equal(summary.club_nudges, 1);
    assert.equal(summary.play_nudges, 1);
    assert.equal(emails.length, 2);
    assert.match(emails[0].subject, /25 free chips are waiting, TheSAUCE\. Join KINGS CLUB/);
    assert.match(emails[0].html, /club code <b>25450<\/b> \(referral code <b>1002337<\/b>\)/);
    assert.match(emails[0].html, /\?join=25450&amp;ref=1002337/);
    assert.equal(emails[0].idempotencyKey, 'welcome-back-club-nudge-n1');
    assert.match(emails[1].subject, /Your 25 free chips are still waiting, Nena/);
    assert.match(emails[1].html, /\?welcome=chips/);
    assert.equal(texts.length, 1, 'Nena has no phone');
    assert.match(texts[0][0], /Join KINGS CLUB with club code 25450 to claim them: .*\?join=25450&ref=1002337 Reply STOP to opt out\.$/);
    assert.deepEqual(calls.marks, [
        { p_user_id: 'n1', p_channel: 'club_nudge_email', p_ok: true, p_detail: null },
        { p_user_id: 'n1', p_channel: 'club_nudge_sms', p_ok: true, p_detail: null },
        { p_user_id: 'n2', p_channel: 'play_nudge_email', p_ok: true, p_detail: null },
    ]);
    assert.equal(summary.nudge_emails_sent, 2);
    assert.equal(summary.nudge_texts_sent, 1);
    assert.deepEqual(summary.nudges.map((n) => `${n.kind}:${n.username}:${n.email}:${n.text}`), ['club:TheSAUCE:sent:sent', 'play:Nena:sent:no phone']);
});

test('a nudge whose email never went out is retried on a later run, with the club code looked up', async () => {
    const run = { awarded: [], awarded_count: 0, no_club: [], no_club_count: 0, failed: [], failed_count: 0, club_nudges: [], club_nudge_count: 0, play_nudges: [], play_nudge_count: 0 };
    const pending = [
        { user_id: 'r1', email: 'r1@example.com', email_sent_at: '2026-10-30T00:00:00Z', phone: null, club_id: null, amount: 25, status: 'no_club', updated_at: new Date(Date.now() - 3600000).toISOString(),
          club_nudge_notified_at: new Date(Date.now() - 3600000).toISOString(), club_nudge_email_at: null, club_nudge_email_error: 'resend 500', club_nudge_sms_at: null, club_nudge_sms_error: null,
          play_nudge_notified_at: null },
        { user_id: 'r2', email: 'r2@example.com', email_sent_at: '2026-10-30T00:00:00Z', phone: null, club_id: 'kings', amount: 25, status: 'awarded', updated_at: new Date(Date.now() - 3600000).toISOString(),
          club_nudge_notified_at: new Date(Date.now() - 2 * 86400000).toISOString(), club_nudge_email_at: null, club_nudge_email_error: null, club_nudge_sms_at: null, club_nudge_sms_error: null,
          play_nudge_notified_at: null },
    ];
    const { sb, calls } = fakeDb({ run, pending, profiles: [{ id: 'r1', username: 'Rone' }], clubs: [{ id: 'kings', name: 'KINGS CLUB', club_id: 25450 }] });
    sb.from = ((orig) => (name) => {
        const q = orig(name);
        if (name === 'clubs') q.maybeSingle = async () => ({ data: { club_id: 25450, name: 'KINGS CLUB' }, error: null });
        if (name === 'referrals') q.then = (resolve) => resolve({ data: [{ referee_id: 'r1', referral_code_used: '1002337' }], error: null });
        return q;
    })(sb.from);
    const emails = [];
    const summary = await runWelcomeBack(sb, { sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; }, sendSms: async () => ({ ok: true }) });
    assert.ok(calls.queries.some((q) => q[0] === 'sp_signup_welcome_back_awards' && q[1] === 'or' && q[2] === PENDING_NUDGE_FILTER));
    assert.equal(emails.length, 1, 'r2 has already joined (status awarded) so the club nudge is moot; r1 is retried');
    assert.deepEqual(emails[0].to, ['r1@example.com']);
    assert.match(emails[0].subject, /Rone/);
    assert.match(emails[0].html, /club code <b>25450<\/b> \(referral code <b>1002337<\/b>\)/);
    assert.equal(summary.nudges[0].source, 'retry');
});

test('nudge templates: whole-number chips, no em dashes, STOP on texts, escaped names', () => {
    const e = clubNudgeEmail({ username: '<Phil>', club: 'KINGS CLUB', clubCode: '25450', referralCode: null, amount: 25 });
    assert.match(e.html, /&lt;Phil&gt;/);
    assert.doesNotMatch(e.html, /referral code/);
    assert.equal(e.url, 'https://smarter.poker/hub/club-arena/?join=25450');
    assert.match(playNudgeEmail({ username: 'A', club: 'KINGS CLUB', amount: '25.00' }).text, /The 25 free chips/);
    for (const t of [e.html, e.text, e.subject, playNudgeEmail({ username: 'A' }).html, clubNudgeSms({ username: 'A', clubCode: '1' }), playNudgeSms({ username: 'A' })]) assert.doesNotMatch(t, /—/);
    assert.match(playNudgeSms({ username: 'A', club: 'KINGS CLUB' }), /Reply STOP to opt out\.$/);
});

import { SEND_BUDGET_MS } from '../src/lib/welcomeBack/run.mjs';

test('when the providers are slow the run stops sending inside its budget and leaves the rest for the next hour', async () => {
    const run = { awarded: AWARDED, awarded_count: 2, no_club: [], no_club_count: 0, failed: [], failed_count: 0,
        club_nudges: [{ user_id: 'u3', username: 'Late', email: 'late@example.com', phone: null, club_code: '25450', referral_code: null, amount: 25 }], club_nudge_count: 1 };
    const { sb, calls } = fakeDb({ run });
    const emails = [];
    const summary = await runWelcomeBack(sb, {
        // The first player's email takes the whole budget.
        deadline: Date.now() + 50,
        sendEmail: async (m) => { emails.push(m); await new Promise((r) => setTimeout(r, 80)); return { ok: true, id: 'e' }; },
        sendSms: async () => ({ ok: true, id: 's' }),
    });
    assert.equal(emails.length, 1, 'the second player and the nudge wait for the next run');
    assert.equal(summary.deferred, 2);
    assert.equal(summary.emails_sent, 1);
    assert.equal(calls.marks.length, 2, 'only the first player\'s receipts were recorded; nothing was marked for players not reached');
    assert.ok(SEND_BUDGET_MS < 300000, 'the budget sits inside the route\'s maxDuration');
});

test('a muted player gets neither email nor text and is never retried; a Twilio timeout is never resent; emails carry an unsubscribe path', async () => {
    const run = { awarded: AWARDED, awarded_count: 2, no_club: [], no_club_count: 0, failed: [], failed_count: 0 };
    const { sb, calls } = fakeDb({ run });
    // u2 has muted everything; u1's text times out at Twilio
    sb.from = ((orig) => (name) => {
        const q = orig(name);
        if (name === 'notification_preferences') q.then = (resolve) => resolve({ data: [{ user_id: 'u2', mute_all: true }], error: null });
        return q;
    })(sb.from);
    const emails = [];
    const summary = await runWelcomeBack(sb, {
        sendEmail: async (m) => { emails.push(m); return { ok: true, id: 'e' }; },
        sendSms: async () => ({ ok: false, error: 'twilio threw: The operation was aborted due to timeout' }),
    });
    assert.equal(emails.length, 1, 'only the unmuted player is emailed');
    assert.deepEqual(emails[0].headers, { 'List-Unsubscribe': '<https://smarter.poker/hub/settings/notifications>' });
    assert.match(emails[0].html, /hub\/settings\/notifications/);
    assert.match(emails[0].text, /hub\/settings\/notifications/);
    assert.equal(summary.muted, 1);
    const smsMark = calls.marks.find((m) => m.p_user_id === 'u1' && m.p_channel === 'sms');
    assert.equal(smsMark.p_ok, false);
    assert.match(smsMark.p_detail, /not resent/, 'a timed-out text is recorded as final, never retried');
    assert.deepEqual(calls.marks.filter((m) => m.p_user_id === 'u2').map((m) => m.p_channel), ['email'], 'u2 has no phone: only the email receipt records the mute');
    assert.match(calls.marks.find((m) => m.p_user_id === 'u2').p_detail, /muted/);
});

test('the summary carries the database verdicts the route pages on', async () => {
    const run = { awarded: [], awarded_count: 0, no_club: [], no_club_count: 0, failed: [{ username: 'x', error: 'Insufficient Promo Balance' }], failed_count: 1, failed_new_count: 1, wallet_empty: true, closed_count: 2 };
    const { sb } = fakeDb({ run });
    const summary = await runWelcomeBack(sb, { sendEmail: async () => ({ ok: true }), sendSms: async () => ({ ok: true }) });
    assert.equal(summary.failed, 1);
    assert.equal(summary.failed_new, 1);
    assert.equal(summary.wallet_empty, true);
    assert.equal(summary.closed, 2);
});

test('when the database reports another run in progress, nothing is sent', async () => {
    const { sb, calls } = fakeDb({ run: { already_running: true }, pending: [{ user_id: 'u9', email: 'x@example.com', phone: null, awarded_at: new Date().toISOString() }] });
    let sends = 0;
    const summary = await runWelcomeBack(sb, { sendEmail: async () => { sends++; return { ok: true }; }, sendSms: async () => { sends++; return { ok: true }; } });
    assert.equal(summary.already_running, true);
    assert.equal(sends, 0);
    assert.equal(calls.marks.length, 0);
});

test('the three welcome-back push types sit under the Bonuses preference', async () => {
    const { eventToTypeKey } = await import('../src/lib/push/push-prefs.js');
    for (const t of ['welcome_back_chips', 'welcome_back_club_nudge', 'welcome_back_play_nudge']) assert.equal(eventToTypeKey(t), 'bonus');
});
