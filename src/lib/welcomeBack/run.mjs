/**
 * Welcome-back chips (Dan, 2026-11-04):
 *
 *   "IF PLAYER DO NOT PLAY A REAL HAND AFTER SIGNING UP, AND JOING AFTER 24
 *    HOURS, THEY SHOULD RECEIVE A PUSH NOTIFICATION, EMAIL AND TEXT AWARDING
 *    THEM 25 FREE CHIPS FROM THE MIDWAY UNION FUNDED BY THE PROMO WALLET TO ANY
 *    AND ALL PLAYERS THAT DIDN'T PLAY LIVE AFTER 24 HOURS OF SIGN UP.
 *    (OBVIOUSLY IF THEY DIDN'T ADD A PHONE NUMBER WE CAN'T TEXT)"
 *
 * The database does the money and the push: fn_sp_signup_welcome_back_run
 * (Club Arena migration 20261104145956) pays each qualifying player 25 chips
 * from the Midway Union promo wallet through fn_promo_disburse, raises the
 * in-app notification (mirrored to push_outbox and sent by push-dispatch), and
 * hands back the email and phone. This module sends the email and the text
 * and records what each channel did (fn_sp_signup_welcome_back_mark), so the
 * daily digest can show it.
 *
 * Pure apart from the injected senders, so __tests__/welcome-back.test.mjs
 * covers every branch without a database, Resend or Twilio.
 */

export const WELCOME_BACK_AMOUNT = 25;
const PLAY_URL = 'https://smarter.poker/hub/club-arena/';
/** Player-facing sender; the digest's alerts@ address is for the owner's ops mail. */
export const WELCOME_BACK_FROM = 'Smarter.Poker <noreply@smarter.poker>';
const UNDIALABLE = 'phone number cannot be dialed';
/** PostgREST: an award with an address whose channel has not gone out. */
export const PENDING_CHANNEL_FILTER = 'and(email.not.is.null,email_sent_at.is.null),and(phone.not.is.null,sms_sent_at.is.null)';

export function welcomeBackEmail({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const name = username || 'there';
    const where = club ? `your ${club} wallet` : 'your club wallet';
    const subject = `${amount} free chips are waiting for you, ${name}`;
    const text = [
        `Hi ${name},`,
        '',
        `You signed up for Smarter.Poker but have not played a hand yet, so the Midway Union just added ${amount} free chips to ${where}.`,
        '',
        `Sit down and play your first hand: ${PLAY_URL}`,
        '',
        'See you at the tables,',
        'Smarter.Poker',
    ].join('\n');
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
        + `<body style="margin:0;padding:0;background:#05070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7edf3;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;"><tr><td align="center" style="padding:28px 12px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f14;border-radius:12px;"><tr><td style="padding:30px 26px;">`
        + `<div style="color:#4fc1b3;font-size:18px;font-weight:800;letter-spacing:3px;">SMARTER.POKER</div>`
        + `<div style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">${esc(amount)} Free Chips Are Waiting For You</div>`
        + `<div style="padding:0 0 16px 0;font-size:15px;line-height:1.55;">Hi ${esc(name)}, you signed up for Smarter.Poker but have not played a hand yet, so the Midway Union just added <b>${esc(amount)} free chips</b> to ${esc(where)}.</div>`
        + `<a href="${PLAY_URL}" style="display:inline-block;background:#4fc1b3;color:#05221f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">Play Your First Hand</a>`
        + `<div style="padding:22px 0 0 0;color:#8a97a8;font-size:12px;line-height:1.6;">Chips are already in your wallet. Open Club Arena, pick a game and sit down.</div>`
        + `</td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

export function welcomeBackSms({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const where = club ? `your ${club} wallet` : 'your club wallet';
    return `Smarter.Poker: ${username ? `${username}, ` : ''}${amount} free chips from the Midway Union just landed in ${where}. Play your first hand: ${PLAY_URL} Reply STOP to opt out.`;
}

/** E.164 or null. Mirrors mfaSmsCode.normalizePhone; a number too short to dial is dropped. */
export function sendablePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('0')) return null; // a trunk-zero national number has no country code to dial
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    return null;
}

/**
 * One run: pay, then mail and text every newly awarded player, plus any player
 * awarded earlier whose email or text never went out (a crash between the
 * credit and the send). Returns a plain summary for the cron response.
 *
 * `deps.sendEmail({to, subject, html, text, idempotencyKey})` and
 * `deps.sendSms(body, {to})` return `{ ok, id?, error? }`.
 */
export async function runWelcomeBack(sb, { limit = 50, sendEmail, sendSms, log = () => {} } = {}) {
    const summary = { awarded: 0, no_club: 0, failed: 0, emails_sent: 0, emails_failed: 0, texts_sent: 0, texts_failed: 0, texts_skipped_no_phone: 0, retried: 0, players: [], errors: [] };

    const { data: run, error } = await sb.rpc('fn_sp_signup_welcome_back_run', { p_limit: limit });
    if (error) throw new Error(`fn_sp_signup_welcome_back_run: ${error.message}`);
    summary.awarded = Number(run?.awarded_count || 0);
    summary.no_club = Number(run?.no_club_count || 0);
    summary.failed = Number(run?.failed_count || 0);
    summary.union_promo_wallet_after = run?.union_promo_wallet_after ?? null;
    for (const f of run?.failed || []) summary.errors.push(`${f.username || f.user_id}: ${f.error}`);

    const todo = new Map();
    for (const a of run?.awarded || []) todo.set(a.user_id, { ...a, needEmail: true, needSms: true, source: 'run' });

    // Awards whose channels never completed (the job died mid-send, or Resend
    // and Twilio were down). A channel that failed with a reason is retried
    // every hour on the award's first day, then once a day for a week, so a
    // provider outage never leaves a paid player untold. Newest first, so a
    // bad day's backlog cannot push this hour's awards past the page.
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: pending, error: pendErr } = await sb
        .from('sp_signup_welcome_back_awards')
        .select('user_id, email, phone, club_id, amount, email_sent_at, sms_sent_at, email_error, sms_error, awarded_at, updated_at')
        .eq('status', 'awarded')
        .gte('awarded_at', since)
        .or(PENDING_CHANNEL_FILTER)
        .order('awarded_at', { ascending: false })
        .limit(200);
    if (pendErr) summary.errors.push(`pending lookup: ${pendErr.message}`);
    const dayAgo = Date.now() - 86400000;
    const dueAgain = Date.now() - 23 * 3600000;
    for (const p of pending || []) {
        if (todo.has(p.user_id)) continue;
        const fresh = new Date(p.awarded_at).getTime() > dayAgo;
        const quietForADay = !p.updated_at || new Date(p.updated_at).getTime() < dueAgain;
        const retryable = (err) => !err || fresh || quietForADay;
        const needEmail = !!p.email && !p.email_sent_at && retryable(p.email_error);
        const needSms = !!p.phone && !p.sms_sent_at && p.sms_error !== UNDIALABLE && retryable(p.sms_error);
        if (!needEmail && !needSms) continue;
        todo.set(p.user_id, { ...p, needEmail, needSms, source: 'retry' });
        summary.retried++;
    }
    if (todo.size) {
        const ids = [...todo.keys()];
        const { data: profiles } = await sb.from('profiles').select('id, username').in('id', ids);
        const { data: clubs } = await sb.from('clubs').select('id, name').in('id', [...new Set([...todo.values()].map((t) => t.club_id).filter(Boolean))]);
        const nameOf = new Map((profiles || []).map((p) => [p.id, p.username]));
        const clubOf = new Map((clubs || []).map((c) => [c.id, c.name]));
        for (const t of todo.values()) {
            if (!t.username) t.username = nameOf.get(t.user_id) || null;
            if (!t.club) t.club = clubOf.get(t.club_id) || null;
        }
    }

    // A receipt that fails to record would make the next run send again, so
    // it gets a second try before that is accepted.
    const mark = async (userId, channel, ok, detail) => {
        let mErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            ({ error: mErr } = await sb.rpc('fn_sp_signup_welcome_back_mark', { p_user_id: userId, p_channel: channel, p_ok: ok, p_detail: detail || null }));
            if (!mErr) return;
        }
        summary.errors.push(`mark ${channel} ${userId}: ${mErr.message}`);
    };

    for (const t of todo.values()) {
        const entry = { user_id: t.user_id, username: t.username, club: t.club, source: t.source, email: 'not needed', text: 'not needed' };
        const amount = Number(t.amount || WELCOME_BACK_AMOUNT);

        if (t.needEmail) {
            if (!t.email) entry.email = 'no email';
            else {
                const msg = welcomeBackEmail({ username: t.username, club: t.club, amount });
                const r = await sendEmail({ to: [t.email], subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: `welcome-back-${t.user_id}`, from: WELCOME_BACK_FROM });
                entry.email = r.ok ? 'sent' : `failed: ${r.error}`;
                if (r.ok) summary.emails_sent++; else summary.emails_failed++;
                await mark(t.user_id, 'email', !!r.ok, r.ok ? null : r.error);
            }
        }

        if (t.needSms) {
            const to = sendablePhone(t.phone);
            if (!to) {
                entry.text = 'no phone';
                summary.texts_skipped_no_phone++;
                if (t.phone) await mark(t.user_id, 'sms', false, UNDIALABLE);
            } else {
                const r = await sendSms(welcomeBackSms({ username: t.username, club: t.club, amount }), { to });
                entry.text = r.ok ? 'sent' : `failed: ${r.error}`;
                if (r.ok) summary.texts_sent++; else summary.texts_failed++;
                await mark(t.user_id, 'sms', !!r.ok, r.ok ? null : r.error);
            }
        }
        summary.players.push(entry);
        log(`[welcome-back] ${t.username || t.user_id}: chips ${t.source === 'run' ? 'paid' : 'already paid'}, email ${entry.email}, text ${entry.text}`);
    }

    return summary;
}
