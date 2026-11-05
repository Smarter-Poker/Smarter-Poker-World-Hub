/**
 * Player announcements (Dan, 2026-11-05): one reusable "announce to every real
 * player" pipeline, so the next announcement is one call instead of a rebuild.
 *
 * The database owns everything except email and text (Club Arena migration
 * player_announcements_reusable_pipeline): public.fn_sp_announce creates the
 * announcement, the in-app popup that needs OK, the push, and the chip credit
 * (paid now, or held and paid when a clubless player joins a Midway Union club,
 * with a "chips landed" push). Receipts live in sp_player_announcement_recipients.
 *
 * This module sends the email (Resend) and the text (Twilio) for every
 * announcement still pending and marks each channel once, so nobody is messaged
 * twice. It runs inside the hourly /api/cron/signup-welcome-back fire (no new
 * cron route, CLAUDE.md section 11). Nothing pending means a no-op.
 */

const PLAY_URL = 'https://smarter.poker/hub/club-arena/';
const UNSUBSCRIBE_URL = 'https://smarter.poker/hub/settings/notifications';
export const ANNOUNCEMENT_FROM = 'Smarter.Poker <noreply@smarter.poker>';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chipsText = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function sendablePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits || digits.startsWith('0')) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    return null;
}

const joinUrl = (code) => `${PLAY_URL}?join=${encodeURIComponent(code || '')}`;

/** The chip line: credited, waiting for a club, or none. */
function chipLine(r) {
    const chips = Number(r.chips || 0);
    if (chips <= 0) return null;
    if (r.status === 'owed') return `${chipsText(chips)} chips are waiting for you. Join KINGS CLUB with club code ${r.club_code} and they land in your wallet automatically.`;
    return `${chipsText(chips)} chips have been added to your wallet.`;
}

export function announcementEmail(r) {
    const name = r.username || 'there';
    const line = chipLine(r);
    const owed = r.status === 'owed' && Number(r.chips || 0) > 0;
    const ctaUrl = owed ? joinUrl(r.club_code) : PLAY_URL;
    const cta = owed ? 'Join KINGS CLUB' : 'Play Now';
    const subject = `${r.title}${line ? ` - ${owed ? `${chipsText(r.chips)} chips are waiting` : `${chipsText(r.chips)} chips added`}` : ''}`;
    const text = [`Hi ${name},`, '', r.body, ...(line ? ['', line] : []), '', `${cta}: ${ctaUrl}`, '', 'Good luck out there!', 'Smarter.Poker', '', `Manage or turn off these emails: ${UNSUBSCRIBE_URL}`].join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
        + `<body style="margin:0;padding:0;background:#05070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7edf3;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;"><tr><td align="center" style="padding:28px 12px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f14;border-radius:12px;"><tr><td style="padding:30px 26px;">`
        + `<div style="color:#4fc1b3;font-size:18px;font-weight:800;letter-spacing:3px;">SMARTER.POKER</div>`
        + `<div style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">${esc(r.title)}</div>`
        + `<div style="padding:0 0 12px 0;font-size:15px;line-height:1.55;">Hi ${esc(name)}, ${esc(r.body)}</div>`
        + (line ? `<div style="padding:0 0 16px 0;font-size:15px;line-height:1.55;">${esc(line)}</div>` : '')
        + `<a href="${esc(ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#05221f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">${esc(cta)}</a>`
        + `<div style="padding:22px 0 0 0;color:#8a97a8;font-size:12px;line-height:1.6;">Good luck out there!</div>`
        + `<div style="padding:14px 0 0 0;color:#8b95a7;font-size:11px;line-height:1.5;">You are getting this because you have a Smarter.Poker account. <a href="${UNSUBSCRIBE_URL}" style="color:#8b95a7;">Manage or turn off these emails</a>.</div>`
        + `</td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

export function announcementSms(r) {
    const who = r.username ? `${r.username}, ` : '';
    const body = r.sms_body || r.body;
    const owed = r.status === 'owed' && Number(r.chips || 0) > 0;
    const line = Number(r.chips || 0) > 0
        ? (owed ? ` ${chipsText(r.chips)} chips are waiting - join KINGS CLUB with code ${r.club_code}: ${joinUrl(r.club_code)}` : ` ${chipsText(r.chips)} chips were added to your wallet. ${PLAY_URL}`)
        : ` ${PLAY_URL}`;
    return `Smarter.Poker: ${who}${body}${line} Reply STOP to opt out.`;
}

export async function runPlayerAnnouncements(sb, { sendEmail, sendSms, log = () => {}, deadline = Date.now() + 50000 } = {}) {
    const summary = { pending: 0, emails_sent: 0, emails_failed: 0, texts_sent: 0, texts_failed: 0, muted: 0, deferred: 0, errors: [] };
    const { data: rows, error } = await sb.rpc('fn_sp_announcement_notice_pending', { p_limit: 200 });
    if (error) { summary.errors.push(`pending: ${error.message}`); return summary; }
    summary.pending = (rows || []).length;
    if (!summary.pending) return summary;

    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: prefs } = await sb.from('notification_preferences').select('user_id, mute_all').in('user_id', ids);
    const muted = new Set((prefs || []).filter((p) => p.mute_all === true).map((p) => p.user_id));
    const mark = async (r, channel, ok, detail) => {
        for (let i = 0; i < 2; i++) {
            const { error: e } = await sb.rpc('fn_sp_announcement_notice_mark', { p_announcement_id: r.announcement_id, p_user_id: r.user_id, p_channel: channel, p_ok: ok, p_detail: detail || null });
            if (!e) return;
            if (i === 1) summary.errors.push(`mark ${channel} ${r.user_id}: ${e.message}`);
        }
    };

    // One text per phone per announcement (shared phones; carrier blocks).
    const textedPhones = new Set();
    for (const r of rows) {
        if (Date.now() >= deadline) { summary.deferred++; continue; }
        if (muted.has(r.user_id)) {
            summary.muted++;
            if (r.need_email) await mark(r, 'email', false, 'muted');
            if (r.need_sms) await mark(r, 'sms', false, 'muted');
            continue;
        }
        if (r.need_email && r.email) {
            const msg = announcementEmail(r);
            const res = await sendEmail({ to: [r.email], subject: msg.subject, html: msg.html, text: msg.text,
                idempotencyKey: `announcement-${r.slug}-${r.user_id}`, from: ANNOUNCEMENT_FROM,
                headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_URL}>` } });
            if (res?.ok) summary.emails_sent++; else summary.emails_failed++;
            await mark(r, 'email', !!res?.ok, res?.ok ? null : String(res?.error || 'unknown'));
        }
        if (r.need_sms && r.phone) {
            const to = sendablePhone(r.phone);
            const phoneKey = `${r.announcement_id}:${to}`;
            if (!to) await mark(r, 'sms', false, 'undialable');
            else if (textedPhones.has(phoneKey)) { summary.texts_duplicate_phone = (summary.texts_duplicate_phone || 0) + 1; await mark(r, 'sms', false, 'duplicate_phone'); }
            else {
                textedPhones.add(phoneKey);
                const res = await sendSms(announcementSms(r), { to });
                const timedOut = /timeout|timed out|aborted/i.test(String(res?.error || ''));
                if (res?.ok) summary.texts_sent++; else summary.texts_failed++;
                await mark(r, 'sms', !!res?.ok, res?.ok ? (res?.id || null) : (timedOut ? 'timeout' : String(res?.error || 'unknown')));
            }
        }
    }
    log(`[player-announcements] pending ${summary.pending}: emails ${summary.emails_sent}/${summary.emails_failed} failed, texts ${summary.texts_sent}/${summary.texts_failed} failed, muted ${summary.muted}, deferred ${summary.deferred}`);
    return summary;
}
