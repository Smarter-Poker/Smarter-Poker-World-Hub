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
/** The chips links land in Club Arena with ?welcome=chips, which announces the welcome_chips push-nudge moment. */
const WELCOME_URL = `${PLAY_URL}?welcome=chips`;
const fmtChips = (v) => Number(v || WELCOME_BACK_AMOUNT).toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Player-facing sender; the digest's alerts@ address is for the owner's ops mail. */
export const WELCOME_BACK_FROM = 'Smarter.Poker <noreply@smarter.poker>';
const UNDIALABLE = 'phone number cannot be dialed';
/** PostgREST: an award with an address whose channel has not gone out. */
export const PENDING_CHANNEL_FILTER = 'and(email.not.is.null,email_sent_at.is.null),and(phone.not.is.null,sms_sent_at.is.null)';
/** PostgREST: a raised nudge with an address whose channel has not gone out. */
export const PENDING_NUDGE_FILTER = 'and(club_nudge_notified_at.not.is.null,email.not.is.null,club_nudge_email_at.is.null),and(club_nudge_notified_at.not.is.null,phone.not.is.null,club_nudge_sms_at.is.null),and(play_nudge_notified_at.not.is.null,email.not.is.null,play_nudge_email_at.is.null),and(play_nudge_notified_at.not.is.null,phone.not.is.null,play_nudge_sms_at.is.null)';
export const KINGS_CLUB_ID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';

export function welcomeBackEmail({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const name = username || 'there';
    const where = club ? `your ${club} wallet` : 'your club wallet';
    const subject = `${fmtChips(amount)} free chips are waiting for you, ${name}`;
    const text = [
        `Hi ${name},`,
        '',
        `You signed up for Smarter.Poker but have not played a hand yet, so the Midway Union just added ${fmtChips(amount)} free chips to ${where}.`,
        '',
        `Sit down and play your first hand: ${WELCOME_URL}`,
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
        + `<div style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">${esc(fmtChips(amount))} Free Chips Are Waiting For You</div>`
        + `<div style="padding:0 0 16px 0;font-size:15px;line-height:1.55;">Hi ${esc(name)}, you signed up for Smarter.Poker but have not played a hand yet, so the Midway Union just added <b>${esc(fmtChips(amount))} free chips</b> to ${esc(where)}.</div>`
        + `<a href="${WELCOME_URL}" style="display:inline-block;background:#4fc1b3;color:#05221f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">Play Your First Hand</a>`
        + `<div style="padding:22px 0 0 0;color:#8a97a8;font-size:12px;line-height:1.6;">Chips are already in your wallet. Open Club Arena, pick a game and sit down.</div>`
        + `</td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

export function welcomeBackSms({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const where = club ? `your ${club} wallet` : 'your club wallet';
    return `Smarter.Poker: ${username ? `${username}, ` : ''}${fmtChips(amount)} free chips from the Midway Union just landed in ${where}. Play your first hand: ${WELCOME_URL} Reply STOP to opt out.`;
}

function shell({ subject, heading, lead, cta, ctaUrl, foot }) {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
        + `<body style="margin:0;padding:0;background:#05070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7edf3;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;"><tr><td align="center" style="padding:28px 12px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f14;border-radius:12px;"><tr><td style="padding:30px 26px;">`
        + `<div style="color:#4fc1b3;font-size:18px;font-weight:800;letter-spacing:3px;">SMARTER.POKER</div>`
        + `<div style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">${esc(heading)}</div>`
        + `<div style="padding:0 0 16px 0;font-size:15px;line-height:1.55;">${lead}</div>`
        + `<a href="${esc(ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#05221f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:8px;">${esc(cta)}</a>`
        + `<div style="padding:22px 0 0 0;color:#8a97a8;font-size:12px;line-height:1.6;">${esc(foot)}</div>`
        + `</td></tr></table></td></tr></table></body></html>`;
}

/** Nudge 1: a sign-up parked without a club. Tells them how to join and claim. */
export function clubNudgeEmail({ username, club, clubCode, referralCode, amount = WELCOME_BACK_AMOUNT }) {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const name = username || 'there';
    const chips = fmtChips(amount);
    const clubName = club || 'KINGS CLUB';
    const url = `${PLAY_URL}?join=${encodeURIComponent(clubCode || '')}${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''}`;
    const subject = `${chips} free chips are waiting, ${name}. Join ${clubName} to claim them`;
    const text = [
        `Hi ${name},`,
        '',
        `You signed up for Smarter.Poker but have not joined a club yet, so your ${chips} free chips from the Midway Union are still waiting.`,
        '',
        `Join ${clubName} with club code ${clubCode || ''}${referralCode ? ` (referral code ${referralCode})` : ''} and the chips land in your wallet within the hour.`,
        '',
        `Join now: ${url}`,
        '',
        'See you at the tables,',
        'Smarter.Poker',
    ].join('\n');
    const html = shell({
        subject,
        heading: `${chips} Free Chips Are Waiting For You`,
        lead: `Hi ${esc(name)}, you signed up for Smarter.Poker but have not joined a club yet. Join <b>${esc(clubName)}</b> with club code <b>${esc(clubCode || '')}</b>${referralCode ? ` (referral code <b>${esc(referralCode)}</b>)` : ''} and the Midway Union adds <b>${esc(chips)} free chips</b> to your wallet within the hour.`,
        cta: `Join ${clubName}`,
        ctaUrl: url,
        foot: 'Open Club Arena, tap Join Club and enter the code if the button does not open it for you.',
    });
    return { subject, text, html, url };
}

export function clubNudgeSms({ username, club, clubCode, referralCode, amount = WELCOME_BACK_AMOUNT }) {
    const url = `${PLAY_URL}?join=${encodeURIComponent(clubCode || '')}${referralCode ? `&ref=${encodeURIComponent(referralCode)}` : ''}`;
    return `Smarter.Poker: ${username ? `${username}, ` : ''}${fmtChips(amount)} free chips are waiting. Join ${club || 'KINGS CLUB'} with club code ${clubCode || ''} to claim them: ${url} Reply STOP to opt out.`;
}

/** Nudge 2: the chips landed, still no hand after the configured delay. */
export function playNudgeEmail({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const name = username || 'there';
    const chips = fmtChips(amount);
    const where = club ? `your ${club} wallet` : 'your club wallet';
    const url = `${PLAY_URL}?welcome=chips`;
    const subject = `Your ${chips} free chips are still waiting, ${name}`;
    const text = [
        `Hi ${name},`,
        '',
        `The ${chips} free chips the Midway Union added to ${where} have not been played yet.`,
        '',
        `Pick a game and sit down: ${url}`,
        '',
        'See you at the tables,',
        'Smarter.Poker',
    ].join('\n');
    const html = shell({
        subject,
        heading: `Your ${chips} Free Chips Are Still Waiting`,
        lead: `Hi ${esc(name)}, the <b>${esc(chips)} free chips</b> the Midway Union added to ${esc(where)} have not been played yet. Pick a game and sit down.`,
        cta: 'Play Your First Hand',
        ctaUrl: url,
        foot: 'Chips are already in your wallet. Open Club Arena, pick a game and sit down.',
    });
    return { subject, text, html, url };
}

export function playNudgeSms({ username, club, amount = WELCOME_BACK_AMOUNT }) {
    const where = club ? `your ${club} wallet` : 'your club wallet';
    return `Smarter.Poker: ${username ? `${username}, ` : ''}your ${fmtChips(amount)} free chips in ${where} are still waiting. Pick a game and sit down: ${WELCOME_URL} Reply STOP to opt out.`;
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
    const summary = { awarded: 0, no_club: 0, failed: 0, emails_sent: 0, emails_failed: 0, texts_sent: 0, texts_failed: 0, texts_skipped_no_phone: 0, retried: 0,
        club_nudges: 0, play_nudges: 0, nudge_emails_sent: 0, nudge_emails_failed: 0, nudge_texts_sent: 0, nudge_texts_failed: 0, nudges: [], players: [], errors: [] };

    const { data: run, error } = await sb.rpc('fn_sp_signup_welcome_back_run', { p_limit: limit });
    if (error) throw new Error(`fn_sp_signup_welcome_back_run: ${error.message}`);
    summary.awarded = Number(run?.awarded_count || 0);
    summary.no_club = Number(run?.no_club_count || 0);
    summary.failed = Number(run?.failed_count || 0);
    summary.union_promo_wallet_after = run?.union_promo_wallet_after ?? null;
    summary.amount = run?.amount ?? WELCOME_BACK_AMOUNT;
    summary.club_nudges = Number(run?.club_nudge_count || 0);
    summary.play_nudges = Number(run?.play_nudge_count || 0);
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

    // ---- Nudges raised by this run (the database already raised the in-app/
    // push leg and stamped *_notified_at; this sends the email and the text
    // and records each). A channel that fails is retried below like the
    // welcome channels: hourly on day one, then daily for a week.
    const nudgeTodo = [];
    for (const n of run?.club_nudges || []) nudgeTodo.push({ kind: 'club', ...n, needEmail: !!n.email, needSms: !!n.phone });
    for (const n of run?.play_nudges || []) nudgeTodo.push({ kind: 'play', ...n, needEmail: !!n.email, needSms: !!n.phone });

    const { data: pendingNudges, error: pendNudgeErr } = await sb
        .from('sp_signup_welcome_back_awards')
        .select('user_id, email, phone, club_id, amount, status, updated_at, club_nudge_notified_at, club_nudge_email_at, club_nudge_email_error, club_nudge_sms_at, club_nudge_sms_error, play_nudge_notified_at, play_nudge_email_at, play_nudge_email_error, play_nudge_sms_at, play_nudge_sms_error')
        .or(PENDING_NUDGE_FILTER)
        .order('updated_at', { ascending: false })
        .limit(200);
    if (pendNudgeErr) summary.errors.push(`pending nudge lookup: ${pendNudgeErr.message}`);
    const seen = new Set(nudgeTodo.map((t) => `${t.kind}:${t.user_id}`));
    for (const p of pendingNudges || []) {
        const quietForADay = !p.updated_at || new Date(p.updated_at).getTime() < dueAgain;
        for (const kind of ['club', 'play']) {
            const at = p[`${kind}_nudge_notified_at`];
            if (!at || seen.has(`${kind}:${p.user_id}`)) continue;
            if (kind === 'club' && p.status !== 'no_club') continue; // they joined; the chips email covers it
            const fresh = new Date(at).getTime() > dayAgo;
            if (new Date(at).getTime() < Date.now() - 7 * 86400000) continue;
            const retryable = (err) => !err || fresh || quietForADay;
            const needEmail = !!p.email && !p[`${kind}_nudge_email_at`] && retryable(p[`${kind}_nudge_email_error`]);
            const needSms = !!p.phone && !p[`${kind}_nudge_sms_at`] && p[`${kind}_nudge_sms_error`] !== UNDIALABLE && retryable(p[`${kind}_nudge_sms_error`]);
            if (!needEmail && !needSms) continue;
            nudgeTodo.push({ kind, user_id: p.user_id, email: p.email, phone: p.phone, club_id: p.club_id, amount: p.amount, needEmail, needSms, source: 'retry' });
            seen.add(`${kind}:${p.user_id}`);
        }
    }
    if (nudgeTodo.some((t) => !t.username || (t.kind === 'club' && !t.club_code) || (t.kind === 'play' && !t.club && t.club_id))) {
        const ids = [...new Set(nudgeTodo.map((t) => t.user_id))];
        const { data: profiles } = await sb.from('profiles').select('id, username, referred_by').in('id', ids);
        const clubIds = [...new Set(nudgeTodo.map((t) => t.club_id).filter(Boolean))];
        const { data: clubs } = clubIds.length ? await sb.from('clubs').select('id, name').in('id', clubIds) : { data: [] };
        const { data: kings } = await sb.from('clubs').select('club_id, name').eq('id', KINGS_CLUB_ID).maybeSingle();
        const { data: refs } = await sb.from('referrals').select('referee_id, referral_code_used').in('referee_id', ids);
        const nameOf = new Map((profiles || []).map((p) => [p.id, p.username]));
        const clubOf = new Map((clubs || []).map((c) => [c.id, c.name]));
        const refOf = new Map((refs || []).map((r) => [r.referee_id, r.referral_code_used]));
        for (const t of nudgeTodo) {
            if (!t.username) t.username = nameOf.get(t.user_id) || null;
            if (t.kind === 'play' && !t.club) t.club = clubOf.get(t.club_id) || null;
            if (t.kind === 'club') {
                if (!t.club_code) t.club_code = kings?.club_id != null ? String(kings.club_id) : null;
                if (!t.club) t.club = kings?.name || 'KINGS CLUB';
                if (!t.referral_code) t.referral_code = refOf.get(t.user_id) || null;
            }
        }
    }

    for (const t of nudgeTodo) {
        const entry = { kind: t.kind, user_id: t.user_id, username: t.username, source: t.source || 'run', email: t.email ? 'not needed' : 'no email', text: t.phone ? 'not needed' : 'no phone' };
        const amount = Number(t.amount || summary.amount || WELCOME_BACK_AMOUNT);
        const msg = t.kind === 'club'
            ? clubNudgeEmail({ username: t.username, club: t.club, clubCode: t.club_code, referralCode: t.referral_code, amount })
            : playNudgeEmail({ username: t.username, club: t.club, amount });
        const smsBody = t.kind === 'club'
            ? clubNudgeSms({ username: t.username, club: t.club, clubCode: t.club_code, referralCode: t.referral_code, amount })
            : playNudgeSms({ username: t.username, club: t.club, amount });
        if (t.needEmail) {
            if (!t.email) entry.email = 'no email';
            else {
                const r = await sendEmail({ to: [t.email], subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: `welcome-back-${t.kind}-nudge-${t.user_id}`, from: WELCOME_BACK_FROM });
                entry.email = r.ok ? 'sent' : `failed: ${r.error}`;
                if (r.ok) summary.nudge_emails_sent++; else summary.nudge_emails_failed++;
                await mark(t.user_id, `${t.kind}_nudge_email`, !!r.ok, r.ok ? null : r.error);
            }
        }
        if (t.needSms) {
            const to = sendablePhone(t.phone);
            if (!to) {
                entry.text = 'no phone';
                if (t.phone) await mark(t.user_id, `${t.kind}_nudge_sms`, false, UNDIALABLE);
            } else {
                const r = await sendSms(smsBody, { to });
                entry.text = r.ok ? 'sent' : `failed: ${r.error}`;
                if (r.ok) summary.nudge_texts_sent++; else summary.nudge_texts_failed++;
                await mark(t.user_id, `${t.kind}_nudge_sms`, !!r.ok, r.ok ? null : r.error);
            }
        }
        summary.nudges.push(entry);
        log(`[welcome-back] ${t.kind} nudge ${t.username || t.user_id}: email ${entry.email}, text ${entry.text}`);
    }

    return summary;
}
