// Every email sender goes through one account helper (2026-11-05). The
// original RESEND_API_KEY is a Free-plan account nobody can log into, capped
// at 100 emails a day; the Pro account sends from mail.smarter.poker. Campaign
// texts reach each phone once per campaign, because one phone on several
// accounts got the platform number blocked by the carrier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resendApiKey, resendFrom, resendSendingDomain } from '../src/lib/email/resendAccount.mjs';
import { sendEmail } from '../src/lib/dailyDigest/delivery.mjs';
import { runRelaunchNotice } from '../src/lib/tournamentRelaunch/notice.mjs';
import { runPlayerAnnouncements } from '../src/lib/playerAnnouncements/notice.mjs';
import { undeliveredTextsTitle } from '../src/lib/dailyDigest/assemble.mjs';

const PRO = { RESEND_API_KEY: 'old-key', RESEND_BULK_API_KEY: 'pro-key' };
const OLD = { RESEND_API_KEY: 'old-key' };

test('the Pro key wins when it is set, the old key otherwise', () => {
    assert.equal(resendApiKey(PRO), 'pro-key');
    assert.equal(resendApiKey(OLD), 'old-key');
    assert.equal(resendApiKey({}), '');
    assert.equal(resendSendingDomain(PRO), 'mail.smarter.poker');
    assert.equal(resendSendingDomain(OLD), 'smarter.poker');
});

test('a root-domain sender moves to mail.smarter.poker only with the Pro key', () => {
    assert.equal(resendFrom('Live Help <support@smarter.poker>', PRO), 'Live Help <support@mail.smarter.poker>');
    assert.equal(resendFrom('alerts@smarter.poker', PRO), 'alerts@mail.smarter.poker');
    assert.equal(resendFrom('Smarter.Poker News <news@smarter.poker>', OLD), 'Smarter.Poker News <news@smarter.poker>');
    // Already on a verified subdomain, or another domain: left alone.
    assert.equal(resendFrom('Alerts <alerts@alerts.smarter.poker>', PRO), 'Alerts <alerts@alerts.smarter.poker>');
    assert.equal(resendFrom('x@mail.smarter.poker', PRO), 'x@mail.smarter.poker');
    assert.equal(resendFrom('x@smarter.pokerclub.com', PRO), 'x@smarter.pokerclub.com');
});

test('sendEmail with no explicit key uses the Pro key and the matching sender', async () => {
    const saved = { a: process.env.RESEND_API_KEY, b: process.env.RESEND_BULK_API_KEY, c: process.env.RESEND_FROM_EMAIL };
    process.env.RESEND_API_KEY = 'old-key'; process.env.RESEND_BULK_API_KEY = 'pro-key'; delete process.env.RESEND_FROM_EMAIL;
    try {
        const calls = [];
        const fetchImpl = async (url, init) => { calls.push({ auth: init.headers.Authorization, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ id: 'e1' }) }; };
        const r = await sendEmail({ to: ['a@example.com'], subject: 's', text: 't', html: 'h', fetchImpl });
        assert.equal(r.ok, true);
        assert.equal(calls[0].auth, 'Bearer pro-key');
        assert.equal(calls[0].body.from, 'Smarter.Poker <alerts@mail.smarter.poker>');
    } finally {
        for (const [k, v] of [['RESEND_API_KEY', saved.a], ['RESEND_BULK_API_KEY', saved.b], ['RESEND_FROM_EMAIL', saved.c]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
});

test('no email sender reads RESEND_API_KEY directly any more', () => {
    const senders = ['src/lib/emailService.js', 'src/lib/emailTemplates.js', 'pages/api/live-help/report-bug.js',
        'pages/api/cron/table-socket-probe.js', 'pages/api/cron/login-probe.js', 'pages/api/cron/email-deliverability-check.js',
        'pages/api/cron/auth-integrity-audit.js', 'pages/api/cron/trigger-audit.js', 'pages/api/news/digest.js', 'pages/api/email/send-welcome.js'];
    for (const f of senders) {
        const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
        assert.ok(src.includes('resendAccount.mjs'), `${f} must use the account helper`);
        assert.ok(!/new Resend\(process\.env\.RESEND_API_KEY\)|Bearer \$\{process\.env\.RESEND_API_KEY\}|const key = \(process\.env\.RESEND_API_KEY/.test(src), `${f} still sends with the old key directly`);
    }
});

function fakeSb(rpcName, rows) {
    const marks = [];
    return {
        marks,
        rpc: async (name, args) => {
            if (name === rpcName) return { data: rows, error: null };
            marks.push(args);
            return { data: null, error: null };
        },
        from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
    };
}

test('the relaunch sender texts a shared phone once and marks the rest duplicate_phone', async () => {
    const rows = ['u1', 'u2', 'u3'].map((id, i) => ({ user_id: id, username: id, status: 'awarded', phone: i === 2 ? '708-555-0101' : '+17085550101', need_sms: true, need_email: false }));
    const sb = fakeSb('fn_sp_relaunch_notice_pending', rows);
    const texts = [];
    const sum = await runRelaunchNotice(sb, { sendEmail: async () => ({ ok: true }), sendSms: async (b, { to }) => { texts.push(to); return { ok: true, id: 'SM1' }; } });
    assert.deepEqual(texts, ['+17085550101']);
    assert.equal(sum.texts_sent, 1);
    assert.deepEqual(sb.marks.filter((m) => m.p_detail === 'duplicate_phone').map((m) => m.p_user_id), ['u2', 'u3']);
});

test('the announcement sender texts a shared phone once per announcement', async () => {
    const base = { slug: 's', title: 'T', body: 'B', chips: 0, status: 'notified', need_sms: true, need_email: false, club_code: '25450' };
    const rows = [
        { ...base, announcement_id: 'a1', user_id: 'u1', phone: '+17085550101' },
        { ...base, announcement_id: 'a1', user_id: 'u2', phone: '7085550101' },
        { ...base, announcement_id: 'a2', user_id: 'u1', phone: '+17085550101' },
    ];
    const sb = fakeSb('fn_sp_announcement_notice_pending', rows);
    const texts = [];
    await runPlayerAnnouncements(sb, { sendEmail: async () => ({ ok: true }), sendSms: async (b, { to }) => { texts.push(to); return { ok: true, id: 'SM1' }; } });
    assert.equal(texts.length, 2);
    assert.deepEqual(sb.marks.filter((m) => m.p_detail === 'duplicate_phone').map((m) => m.p_user_id), ['u2']);
});

test('the digest names undelivered texts in plain words', () => {
    assert.equal(undeliveredTextsTitle({ total: 3, by_code: { 30005: 2, 21610: 1 } }),
        '3 texts did not reach the phone (2 number unknown or blocked by the carrier, 1 player texted STOP)');
});

test('the push ask reaches a player who skipped phone verification once the first day has passed', async () => {
    const { pushAskMaySettle } = await import('../src/lib/push/pushAskGate.mjs');
    const now = Date.parse('2026-11-05T22:00:00Z');
    assert.equal(pushAskMaySettle({ phone_verified: true, created_at: '2026-11-05T21:59:00Z' }, { now }), true);
    assert.equal(pushAskMaySettle({ phone_verified: false, created_at: '2026-11-05T21:00:00Z' }, { now }), false);
    assert.equal(pushAskMaySettle({ phone_verified: false, created_at: '2026-11-05T21:00:00Z' }, { now, skipped: true }), true);
    assert.equal(pushAskMaySettle({ phone_verified: false, created_at: '2026-11-01T00:00:00Z' }, { now }), true);
    assert.equal(pushAskMaySettle(null, { now }), false);
});
