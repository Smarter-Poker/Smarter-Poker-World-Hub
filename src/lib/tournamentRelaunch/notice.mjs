/**
 * Tournament Arena relaunch notice (Dan, 2026-11-05):
 *
 *   "SEND A PUSH NOTIFICATION, TEXT AND EMAIL TO EVERY USER WE HAVE INFORMATION
 *    ON TO LET THEM KNOW THAT THE TOURNAMENT SERVER HAS BEEN FULLY UPDATED AND
 *    THAT ALL EVENTS ARE BACK UP, LIVE AND RUNNING, AND CREDIT EVERY SINGLE
 *    ACCOUNT WITH 25 CHIPS ... FROM THE UNION PROMO WALLET."
 *
 * The database owns the money and the audience (Club Arena migrations
 * tournament_relaunch_award_ledger_and_runner + tournament_relaunch_notice_receipts):
 * sp_relaunch_awards holds every real player once, paid ('awarded') or waiting for a
 * Midway Union club seat ('owed', paid automatically by pg_cron when they join).
 * This module sends the email (Resend) and the text (Twilio) and records each
 * channel's receipt with fn_sp_relaunch_notice_mark, so nobody is messaged twice.
 *
 * It runs inside the hourly /api/cron/signup-welcome-back fire, after the
 * welcome-back run, so it needs no schedule of its own. When every receipt is in,
 * fn_sp_relaunch_notice_pending returns nothing and this is a no-op.
 */

const PLAY_URL = 'https://smarter.poker/hub/club-arena/';
const UNSUBSCRIBE_URL = 'https://smarter.poker/hub/settings/notifications';
export const RELAUNCH_FROM = 'Smarter.Poker <noreply@smarter.poker>';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sendablePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits || digits.startsWith('0')) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    return null;
}

function joinUrl(code) {
    return `${PLAY_URL}?join=${encodeURIComponent(code || '')}`;
}

export function relaunchEmail({ username, owed, clubCode }) {
    const name = username || 'there';
    const subject = owed
        ? `The Tournament Arena is back open, ${name} - 25 chips are waiting for you`
        : `The Tournament Arena is back open, ${name} - 25 chips added to your wallet`;
    const chipsLine = owed
        ? `It took a little longer than expected to fully finish the update, so we have 25 chips waiting for you for the delay. Join KINGS CLUB with club code ${clubCode} and they land in your wallet automatically.`
        : 'It took a little longer than expected to fully finish the update, so we have credited your account with 25 chips for the delay.';
    const ctaUrl = owed ? joinUrl(clubCode) : PLAY_URL;
    const cta = owed ? 'Join KINGS CLUB' : 'Play Now';
    const text = [
        `Hi ${name},`,
        '',
        'Thank you for your patience while we updated the Poker Tournament Arena. The tournament server is fully updated, and all MTTs, Spins, Sit & Gos and Satellites are back up, live and running.',
        '',
        chipsLine,
        '',
        `${cta}: ${ctaUrl}`,
        '',
        'Good luck out there!',
        'Smarter.Poker',
        '',
        `Manage or turn off these emails: ${UNSUBSCRIBE_URL}`,
    ].join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
        + `<body style="margin:0;padding:0;background:#05070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7edf3;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;"><tr><td align="center" style="padding:28px 12px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f14;border-radius:12px;"><tr><td style="padding:30px 26px;">`
        + `<div style="color:#4fc1b3;font-size:18px;font-weight:800;letter-spacing:3px;">SMARTER.POKER</div>`
        + `<div style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">The Tournament Arena Is Back Open</div>`
        + `<div style="padding:0 0 12px 0;font-size:15px;line-height:1.55;">Hi ${esc(name)}, thank you for your patience while we updated the Poker Tournament Arena. The tournament server is fully updated, and all MTTs, Spins, Sit &amp; Gos and Satellites are back up, live and running.</div>`
        + `<div style="padding:0 0 16px 0;font-size:15px;line-height:1.55;">${esc(chipsLine)}</div>`
        + `<a href="${esc(ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#05221f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">${esc(cta)}</a>`
        + `<div style="padding:22px 0 0 0;color:#8a97a8;font-size:12px;line-height:1.6;">Good luck out there!</div>`
        + `<div style="padding:14px 0 0 0;color:#8b95a7;font-size:11px;line-height:1.5;">You are getting this because you have a Smarter.Poker account. <a href="${UNSUBSCRIBE_URL}" style="color:#8b95a7;">Manage or turn off these emails</a>.</div>`
        + `</td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

export function relaunchSms({ username, owed, clubCode }) {
    const who = username ? `${username}, ` : '';
    return owed
        ? `Smarter.Poker: ${who}the Tournament Arena is fully updated and all MTTs, Spins, Sit & Gos and Satellites are back live. 25 chips are waiting for you for the delay - join KINGS CLUB with code ${clubCode}: ${joinUrl(clubCode)} Reply STOP to opt out.`
        : `Smarter.Poker: ${who}the Tournament Arena is fully updated and all MTTs, Spins, Sit & Gos and Satellites are back live. We credited your wallet 25 chips for the delay. Good luck out there! ${PLAY_URL} Reply STOP to opt out.`;
}

/**
 * Send what is pending. `deadline` stops sending inside the route's budget;
 * anything not reached stays pending and goes out on the next hourly fire.
 */
export async function runRelaunchNotice(sb, { sendEmail, sendSms, log = () => {}, deadline = Date.now() + 50000 } = {}) {
    const summary = { pending: 0, emails_sent: 0, emails_failed: 0, texts_sent: 0, texts_failed: 0, muted: 0, deferred: 0, errors: [] };
    const { data: rows, error } = await sb.rpc('fn_sp_relaunch_notice_pending', { p_limit: 200 });
    if (error) { summary.errors.push(`pending: ${error.message}`); return summary; }
    summary.pending = (rows || []).length;
    if (!summary.pending) return summary;

    const ids = rows.map((r) => r.user_id);
    const { data: prefs } = await sb.from('notification_preferences').select('user_id, mute_all').in('user_id', ids);
    const muted = new Set((prefs || []).filter((p) => p.mute_all === true).map((p) => p.user_id));

    const mark = async (userId, channel, ok, detail) => {
        for (let i = 0; i < 2; i++) {
            const { error: e } = await sb.rpc('fn_sp_relaunch_notice_mark', { p_user_id: userId, p_channel: channel, p_ok: ok, p_detail: detail || null });
            if (!e) return;
            if (i === 1) summary.errors.push(`mark ${channel} ${userId}: ${e.message}`);
        }
    };

    for (const r of rows) {
        if (Date.now() >= deadline) { summary.deferred++; continue; }
        if (muted.has(r.user_id)) {
            summary.muted++;
            if (r.need_email) await mark(r.user_id, 'email', false, 'muted');
            if (r.need_sms) await mark(r.user_id, 'sms', false, 'muted');
            continue;
        }
        const owed = r.status === 'owed';
        if (r.need_email && r.email) {
            const msg = relaunchEmail({ username: r.username, owed, clubCode: r.club_code });
            const res = await sendEmail({ to: [r.email], subject: msg.subject, html: msg.html, text: msg.text,
                idempotencyKey: `tournament-relaunch-20261105-${r.user_id}`, from: RELAUNCH_FROM,
                headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_URL}>` } });
            if (res?.ok) summary.emails_sent++; else summary.emails_failed++;
            await mark(r.user_id, 'email', !!res?.ok, res?.ok ? null : String(res?.error || 'unknown'));
        }
        if (r.need_sms && r.phone) {
            const to = sendablePhone(r.phone);
            if (!to) { await mark(r.user_id, 'sms', false, 'undialable'); }
            else {
                const res = await sendSms(relaunchSms({ username: r.username, owed, clubCode: r.club_code }), { to });
                const timedOut = /timeout|timed out|aborted/i.test(String(res?.error || ''));
                if (res?.ok) summary.texts_sent++; else summary.texts_failed++;
                // A text has no idempotency key: a timeout is never resent.
                // On success the detail is Twilio's message id, so the carrier's final
                // result (sms_delivery_receipts) can be joined to this player.
                await mark(r.user_id, 'sms', !!res?.ok, res?.ok ? (res?.id || null) : (timedOut ? 'timeout' : String(res?.error || 'unknown')));
            }
        }
    }
    log(`[tournament-relaunch] pending ${summary.pending}: emails ${summary.emails_sent} sent/${summary.emails_failed} failed, texts ${summary.texts_sent} sent/${summary.texts_failed} failed, muted ${summary.muted}, deferred ${summary.deferred}`);
    return summary;
}
