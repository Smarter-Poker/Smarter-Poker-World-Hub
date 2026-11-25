/**
 * Automated Player Lifecycle Retention Engine (World Hub)
 *
 * Evaluates and dispatches three strict non-repeating player retention triggers
 * while recording permanent deterministic UUID markers in
 * `public.newsletter_campaigns.article_ids` under `[Lifecycle] ...`:
 *
 *   1. `unverified_48h` (Permanent Once-Ever):
 *      Human profiles created 48h..14d ago with `phone_verified !== true`.
 *      Invites them to finish phone verification at `/hub/verify-phone` to
 *      unlock their Kings Club (`Code 25450`) seat.
 *
 *   2. `welcome_back_21d` (Max Once Per 90 Days):
 *      Human profiles whose last activity (`max(last_active, created_at)`) sits
 *      in the 22..30 day dormancy window (or >= 22d when `includeOlderDormant`
 *      is explicitly enabled) and who have not redeemed the Welcome-Back promo.
 *      Sends signed `/promo/welcome-back?wb=...` email + optional deduplicated
 *      SMS (`/go/welcome-back`) when phone is verified and not suppressed.
 *
 *   3. `vip_diamond_nudge` (Max Once Per 60 Days):
 *      Human profiles whose `vip_expires_at` is within `[now - 3d, now + 3d]`
 *      OR who hold `diamonds >= 500` and have been inactive `14..20` days.
 *
 * Palette Law: Vanguard teal (#4fc1b3), blue (#60a5fa), white (#ffffff), and
 * dark slate (#05070a / #0b1118 / #101a25) ONLY. Zero yellow/purple hexes,
 * zero em dashes, CAN-SPAM Oak Lawn PO Box + One-Click List-Unsubscribe.
 */
import crypto from 'crypto';
import { resendApiKey, resendFrom } from '../email/resendAccount.mjs';
import { sendSms as defaultSendSms } from '../dailyDigest/delivery.mjs';
import {
    DEFAULT_POSTAL_ADDRESS,
    DEFAULT_PROMO_FROM,
    DEFAULT_SITE_URL,
    ensureSmsStopFooter,
    makeUnsubscribeToken,
    normalizeDeliverableEmail,
    normalizeExplicitTestEmail,
    sendablePhone,
} from './dispatch.mjs';
import { WELCOME_BACK_CODE, buildWelcomeBackOfferUrl } from './welcomeBackOffer.mjs';

export const LIFECYCLE_CAMPAIGN_SUBJECT = '[Lifecycle] Automated Retention Triggers';
export const LIFECYCLE_SUBJECT_PREFIX = '[Lifecycle]';
export const LIFECYCLE_TRIGGERS = ['unverified_48h', 'welcome_back_21d', 'vip_diamond_nudge'];

const PAGE_SIZE = 1000;
const IN_BATCH_SIZE = 100;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SYNTHETIC_USERNAME_RE = /^(?:deleted-|crest_cert_|postdeploy|reels_qa|trivia_canary|codex-)/i;
const PERMANENT_SMS_ERROR_CODES = new Set([30004, 30005, 30006, 21211, 21610, 21614]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEMETRY_TOKEN_RE = /(?:^|\s*\|\s*)telemetry:(\{[^{}]*\})\s*$/;

export function extractResendCampaignId(tags) {
    if (!tags) return null;
    if (Array.isArray(tags)) {
        for (const item of tags) {
            const name = String(item?.name || '').trim().toLowerCase();
            if (name === 'campaign_id') {
                const val = String(item?.value || '').trim();
                return UUID_RE.test(val) ? val.toLowerCase() : null;
            }
        }
        return null;
    }
    if (typeof tags === 'object') {
        const val = String(tags.campaign_id ?? tags.campaignId ?? '').trim();
        return UUID_RE.test(val) ? val.toLowerCase() : null;
    }
    return null;
}

export function parseCampaignTelemetrySummary(errorSummary) {
    const raw = String(errorSummary || '').trim();
    if (!raw) {
        return { opens: 0, clicks: 0, cleanErrorSummary: null };
    }
    const match = raw.match(TELEMETRY_TOKEN_RE);
    if (!match) {
        return { opens: 0, clicks: 0, cleanErrorSummary: raw };
    }
    let opens = 0;
    let clicks = 0;
    try {
        const parsed = JSON.parse(match[1]);
        opens = Math.max(0, Math.floor(Number(parsed?.opens || 0)));
        clicks = Math.max(0, Math.floor(Number(parsed?.clicks || 0)));
    } catch {
        /* ignore malformed telemetry json */
    }
    const prefix = raw.slice(0, match.index).trim();
    return {
        opens,
        clicks,
        cleanErrorSummary: prefix || null,
    };
}

export function applyCampaignTelemetryEvent(errorSummary, eventType) {
    const current = parseCampaignTelemetrySummary(errorSummary);
    const nextOpens = current.opens + (eventType === 'email.opened' ? 1 : 0);
    const nextClicks = current.clicks + (eventType === 'email.clicked' ? 1 : 0);
    const serialized = `telemetry:${JSON.stringify({ opens: nextOpens, clicks: nextClicks })}`;
    return {
        opens: nextOpens,
        clicks: nextClicks,
        errorSummary: current.cleanErrorSummary ? `${current.cleanErrorSummary} | ${serialized}` : serialized,
    };
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseTimestampMs(raw) {
    if (raw == null || raw === '') return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const str = String(raw).trim();
    if (!str) return 0;
    if (/^\d{10,13}$/.test(str)) {
        const num = Number(str);
        return str.length === 10 ? num * 1000 : num;
    }
    const parsed = Date.parse(str);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Deterministic v4-shaped UUID from SHA-256(`sp-lifecycle:<trigger>:<userId>`).
 * Stored inside `newsletter_campaigns.article_ids` for zero-table auditability.
 */
export function lifecycleMarkerUuid(trigger, userId) {
    const cleanTrigger = String(trigger || '').trim().toLowerCase();
    const cleanUser = String(userId || '').trim().toLowerCase();
    const hex = crypto
        .createHash('sha256')
        .update(`sp-lifecycle:${cleanTrigger}:${cleanUser}`)
        .digest('hex');
    const v4Nibble = `4${hex.slice(13, 16)}`;
    const variantNibble = `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v4Nibble}-${variantNibble}-${hex.slice(20, 32)}`;
}

/**
 * Returns true if a `newsletter_subscribers.source` string opts the contact out
 * of promotional and lifecycle retention emails (`pref:wire_only` or active `snooze:<iso>`).
 */
export function isSourceSuppressedForLifecycle(source, nowMs = Date.now()) {
    const clean = String(source || '').trim();
    if (!clean) return false;
    if (clean === 'pref:wire_only') return true;
    if (clean.toLowerCase().startsWith('snooze:')) {
        const rawTs = clean.slice('snooze:'.length).trim();
        const untilMs = parseTimestampMs(rawTs);
        if (untilMs > nowMs) return true;
    }
    return false;
}

async function fetchPaged(queryBuilderFactory, maxRows = 25000) {
    const rows = [];
    for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
        const upper = Math.min(offset + PAGE_SIZE, maxRows) - 1;
        const { data, error } = await queryBuilderFactory(offset, upper);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }
    return rows;
}

async function defaultSendLifecycleEmail({
    to,
    subject,
    html,
    text,
    from = DEFAULT_PROMO_FROM,
    headers = null,
    tags = null,
    idempotencyKey = null,
    fetchImpl = fetch,
}) {
    const apiKey = resendApiKey();
    if (!apiKey) return { ok: false, error: 'Resend API key is not configured' };
    const sender = resendFrom(from || DEFAULT_PROMO_FROM);
    const recipients = Array.isArray(to) ? to : to ? [to] : [];
    if (recipients.length === 0) return { ok: false, error: 'Recipient email required' };

    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const payload = {
                from: sender,
                to: recipients,
                subject,
                html,
                text,
                ...(headers ? { headers } : {}),
                ...(Array.isArray(tags) && tags.length > 0 && attempt === 1 ? { tags } : {}),
            };
            const res = await fetchImpl('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
                },
                signal: AbortSignal.timeout(12000),
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body?.id) return { ok: true, id: body.id };
            lastError = `resend ${res.status}: ${String(body?.message || JSON.stringify(body)).slice(0, 240)}`;
            if (res.status >= 400 && res.status < 500 && res.status !== 429 && attempt === 2) break;
        } catch (err) {
            lastError = `resend threw: ${String(err?.message || err).slice(0, 200)}`;
        }
    }
    return { ok: false, error: lastError || 'Resend delivery failed' };
}

export function renderLifecycleEmail({
    trigger,
    username = '',
    userId = '',
    diamonds = 0,
    vipExpiresAt = null,
    siteUrl = DEFAULT_SITE_URL,
    postalAddress = DEFAULT_POSTAL_ADDRESS,
    unsubscribeUrl = '',
    preferencesUrl = '',
    subjectPrefix = '',
    nowMs = Date.now(),
} = {}) {
    const cleanSite = String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const cleanPostal = String(postalAddress || DEFAULT_POSTAL_ADDRESS).trim();
    const greeting = username ? `Hi @${username},` : 'Hi there,';
    const diamondCount = Math.max(0, Math.floor(Number(diamonds || 0)));

    let badge = 'PLAYER RETENTION';
    let baseSubject = 'Your Smarter.Poker Account Update';
    let preheader = 'Unlock your Kings Club (Code 25450) seat, GTO training tools, and player rewards on Smarter.Poker.';
    let headline = 'Your Seat At Smarter.Poker Is Waiting';
    let paragraphs = [];
    let ctaLabel = 'Open Smarter.Poker';
    let ctaUrl = `${cleanSite}/hub/club-arena/`;
    let secondaryNote = 'Kings Club (Club Code 25450) runs nightly NLH and PLO action inside Club Arena.';

    if (trigger === 'unverified_48h') {
        badge = 'FINISH ACCOUNT SETUP';
        baseSubject = 'Finish Phone Verification To Unlock Your Kings Club (Code 25450) Seat';
        preheader = 'Verify your mobile number in 30 seconds to unlock your Kings Club (Code 25450) seat on Smarter.Poker.';
        headline = 'Verify Your Phone To Unlock Kings Club (Code 25450)';
        paragraphs = [
            `${greeting} you created your Smarter.Poker account, and you are one quick step away from taking your seat at the tables.`,
            'Verify your mobile phone number in 30 seconds to activate full account security, unlock your Kings Club (Club Code 25450) seat in Club Arena, and enable instant player rewards.',
        ];
        ctaLabel = 'Verify Your Phone Number';
        ctaUrl = `${cleanSite}/hub/verify-phone`;
        secondaryNote = 'Once verified, enter Club Code 25450 inside Club Arena to join Kings Club immediately.';
    } else if (trigger === 'welcome_back_21d') {
        badge = 'WELCOME-BACK OFFER';
        baseSubject = 'We Miss You At The Tables: Claim 25 Free Chips, 500 Diamonds & 1-Month VIP';
        preheader = 'Accept your Welcome-Back Offer for 25 Free Chips in Kings Club (Code 25450), 500 Free Diamonds, and 30-Day VIP.';
        headline = '25 Free Chips + 500 Free Diamonds + 1-Month Free VIP';
        paragraphs = [
            `${greeting} it has been a few weeks since your last session on Smarter.Poker, and your seat in Kings Club (Club Code 25450) is open.`,
            'Click below to accept your personal Welcome-Back Offer and unlock 25 Free Chips in Kings Club, 500 Free Diamonds, and 1 Month of Free VIP Access.',
        ];
        ctaLabel = 'Accept Your Offer';
        ctaUrl = buildWelcomeBackOfferUrl(`${cleanSite}/promo/welcome-back`, {
            userId,
            siteUrl: cleanSite,
            nowMs,
        });
        secondaryNote = 'Rewards are credited directly to your Smarter.Poker wallet as soon as you accept the offer.';
    } else {
        const vipExpMs = parseTimestampMs(vipExpiresAt);
        const isVipWindow = vipExpMs > 0 && Math.abs(vipExpMs - nowMs) <= 3 * DAY_MS;
        if (isVipWindow) {
            const alreadyExpired = vipExpMs < nowMs;
            badge = 'VIP MEMBERSHIP STATUS';
            baseSubject = alreadyExpired
                ? 'Your Smarter.Poker VIP Access Recently Expired - Renew Your Perks'
                : 'Your Smarter.Poker VIP Access Expires Soon';
            preheader = 'Keep your Smarter.Poker VIP perks, higher Diamond ceilings, and full GTO Hand Lab access active.';
            headline = alreadyExpired
                ? 'Reactivate Your Smarter.Poker VIP Edge'
                : 'Your Smarter.Poker VIP Window Is Closing Soon';
            paragraphs = [
                `${greeting} your Smarter.Poker VIP membership ${alreadyExpired ? 'just expired' : 'is scheduled to expire within the next 72 hours'}.`,
                `Keep your VIP badge, elevated Diamond earning limits${diamondCount > 0 ? ` (current balance: ${diamondCount.toLocaleString('en-US')} Diamonds)` : ''}, and full GTO training access uninterrupted.`,
            ];
            ctaLabel = 'Manage VIP Membership';
            ctaUrl = `${cleanSite}/hub/vip-membership`;
            secondaryNote = 'Jump back into Kings Club (Code 25450) anytime from the Club Arena lobby.';
        } else {
            const formattedDiamonds = diamondCount.toLocaleString('en-US');
            badge = 'DIAMOND BALANCE REMINDER';
            baseSubject = `You Have ${formattedDiamonds} Diamonds Waiting On Smarter.Poker`;
            preheader = `Put your ${formattedDiamonds} Smarter.Poker Diamonds to work in Trivia, GTO Training, and Kings Club (Code 25450).`;
            headline = `${formattedDiamonds} Diamonds Are Waiting In Your Account`;
            paragraphs = [
                `${greeting} you have ${formattedDiamonds} unclaimed or unused Diamonds sitting in your Smarter.Poker balance.`,
                'Use your Diamonds across Poker Trivia challenges, GTO Hand Lab drills, and the Smarter.Poker Store, then grab a seat in Kings Club (Club Code 25450).',
            ];
            ctaLabel = 'Use Your Diamonds';
            ctaUrl = `${cleanSite}/hub/club-arena/`;
            secondaryNote = 'Your Diamond balance never sleeps - put it to work on your next session.';
        }
    }

    const finalSubject = subjectPrefix ? `${subjectPrefix} ${baseSubject}`.trim() : baseSubject;
    const safeUnsub = escapeHtml(unsubscribeUrl || `${cleanSite}/api/news/subscribe?unsubscribe=preview`);
    const safePrefs = escapeHtml(preferencesUrl || unsubscribeUrl || `${cleanSite}/hub/email-preferences`);
    const safeArchive = escapeHtml(`${cleanSite}/hub/wire`);
    const safeSite = escapeHtml(cleanSite);
    const safePostal = escapeHtml(cleanPostal);

    const htmlParagraphs = paragraphs
        .map(
            (p) =>
                `<p style="margin:0 0 16px 0;color:#d6e3f0;font-size:15px;line-height:1.62;">${escapeHtml(p)}</p>`
        )
        .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(finalSubject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b1118;border:1px solid #1b2c3d;border-radius:14px;">
<tr><td style="padding:32px 28px;">
<div style="color:#4fc1b3;font-size:12px;font-weight:800;letter-spacing:2.6px;text-transform:uppercase;">SMARTER.POKER &middot; ${escapeHtml(badge)}</div>
<h1 style="margin:14px 0 18px 0;color:#ffffff;font-size:24px;line-height:1.28;font-weight:800;">${escapeHtml(headline)}</h1>
${htmlParagraphs}
<div style="padding:8px 0 22px 0;">
<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
</div>
<div style="margin:0 0 22px 0;padding:14px 16px;background:#101a25;border:1px solid #1b2c3d;border-radius:10px;color:#9fb3c8;font-size:13px;line-height:1.55;">
<span style="color:#60a5fa;font-weight:700;">Kings Club (Code 25450):</span> ${escapeHtml(secondaryNote)}
</div>
<div style="border-top:1px solid #1c2a38;padding-top:18px;color:#7f93a8;font-size:12px;line-height:1.65;">
<div>Smarter.Poker &middot; ${safePostal}</div>
<div style="margin-top:6px;">
<a href="${safePrefs}" style="color:#60a5fa;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${safeUnsub}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="${safeArchive}" style="color:#9fb3c8;text-decoration:underline;">Web Archive</a> &middot;
<a href="${safeSite}" style="color:#9fb3c8;text-decoration:underline;">Smarter.Poker</a>
</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = [
        `SMARTER.POKER | ${badge}`,
        '',
        headline,
        '',
        ...paragraphs.flatMap((p) => [p, '']),
        `${ctaLabel}: ${ctaUrl}`,
        '',
        secondaryNote,
        '',
        '---',
        `Smarter.Poker | ${cleanPostal}`,
        `Email Preferences: ${preferencesUrl || unsubscribeUrl}`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    return {
        subject: finalSubject,
        preheader,
        headline,
        ctaUrl,
        html,
        text,
    };
}

export function buildWelcomeBackLifecycleSms() {
    return ensureSmsStopFooter(
        'Smarter.Poker: Your Kings Club (Code 25450) seat is waiting. Accept 25 Free Chips, 500 Diamonds + 1-Month Free VIP: https://smarter.poker/go/welcome-back Reply STOP to opt out.'
    );
}

/**
 * Send a single `[TEST]` lifecycle email to `testEmail` without writing any
 * ledger markers or campaign rows.
 */
export async function sendTestLifecycleEmail(
    _supabase,
    {
        trigger = 'unverified_48h',
        testEmail = '',
        sendEmailFn = defaultSendLifecycleEmail,
        siteUrl = DEFAULT_SITE_URL,
        nowMs = Date.now(),
    } = {}
) {
    const targetEmail = normalizeExplicitTestEmail(testEmail);
    if (!targetEmail) {
        throw new Error('Enter a valid test email address.');
    }
    const cleanTrigger = LIFECYCLE_TRIGGERS.includes(trigger) ? trigger : 'unverified_48h';
    const cleanSite = String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const unsubToken = makeUnsubscribeToken(targetEmail);
    const unsubUrl = `${cleanSite}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
    const preferencesUrl = `${cleanSite}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;

    const rendered = renderLifecycleEmail({
        trigger: cleanTrigger,
        username: 'testplayer',
        userId: '00000000-0000-4000-8000-000000000001',
        diamonds: 1250,
        vipExpiresAt: new Date(nowMs + 2 * DAY_MS).toISOString(),
        siteUrl: cleanSite,
        unsubscribeUrl: unsubUrl,
        preferencesUrl,
        subjectPrefix: '[TEST]',
        nowMs,
    });

    const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM);
    const res = await sendEmailFn({
        to: [targetEmail],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        from: process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM,
        headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
    });

    if (!res?.ok) {
        throw new Error(res?.error || 'Unable to send test lifecycle email.');
    }

    return {
        success: true,
        testOnly: true,
        trigger: cleanTrigger,
        targetEmail,
        from,
        subject: rendered.subject,
    };
}

export async function previewLifecycleRetention(supabase, opts = {}) {
    return runLifecycleRetention(supabase, { ...opts, dryRun: true });
}

export async function runLifecycleRetention(
    supabase,
    {
        dryRun = true,
        dailyGate = false,
        includeOlderDormant = false,
        maxPerTrigger = 25,
        nowMs = Date.now(),
        sendEmailFn = defaultSendLifecycleEmail,
        sendSmsFn = defaultSendSms,
        siteUrl = DEFAULT_SITE_URL,
        createdBy = null,
    } = {}
) {
    const cleanSite = String(siteUrl || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const cap = Math.max(1, Math.min(Number(maxPerTrigger) || 25, 250));
    const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM);
    const emailConfigured = Boolean(resendApiKey());
    const smsConfigured = Boolean(
        (process.env.TWILIO_ACCOUNT_SID || '').trim() &&
            (process.env.TWILIO_AUTH_TOKEN || '').trim() &&
            (process.env.TWILIO_PHONE_NUMBER || '').trim()
    );

    // 1. Load historical [Lifecycle]% rows from newsletter_campaigns
    const campaignRows = await fetchPaged(
        (offset, upper) =>
            supabase
                .from('newsletter_campaigns')
                .select('id, subject, status, article_ids, created_at')
                .order('created_at', { ascending: false })
                .range(offset, upper),
        2000
    );

    const lifecycleCampaigns = (campaignRows || []).filter((row) =>
        String(row?.subject || '').startsWith(LIFECYCLE_SUBJECT_PREFIX)
    );

    const recentRunCutoffMs = nowMs - 20 * HOUR_MS;
    const alreadyRanToday = lifecycleCampaigns.some((row) => {
        if (row?.status === 'failed' || row?.status === 'cancelled') return false;
        const createdMs = parseTimestampMs(row?.created_at);
        return createdMs >= recentRunCutoffMs;
    });

    if (dailyGate && alreadyRanToday && !dryRun) {
        return {
            success: true,
            dryRun: false,
            skipped: true,
            alreadyRanToday: true,
            reason: 'already_ran_within_20h',
            dueTotal: 0,
            sent: 0,
            emailSent: 0,
            smsSent: 0,
            failed: 0,
            counts: { unverified_48h: 0, welcome_back_21d: 0, vip_diamond_nudge: 0 },
        };
    }

    const everMarkers = new Set();
    const markers90d = new Set();
    const markers60d = new Set();
    const cutoff90dMs = nowMs - 90 * DAY_MS;
    const cutoff60dMs = nowMs - 60 * DAY_MS;

    for (const row of lifecycleCampaigns) {
        if (row?.status === 'failed' || row?.status === 'cancelled') continue;
        const createdMs = parseTimestampMs(row?.created_at);
        const ids = Array.isArray(row?.article_ids) ? row.article_ids : [];
        for (const rawId of ids) {
            const cleanId = String(rawId || '').trim().toLowerCase();
            if (!cleanId) continue;
            everMarkers.add(cleanId);
            if (createdMs >= cutoff90dMs) markers90d.add(cleanId);
            if (createdMs >= cutoff60dMs) markers60d.add(cleanId);
        }
    }

    // 2. Load subscriber suppressions (unsubscribed, bounces, pref:wire_only, active snooze)
    const suppressedEmails = new Set();
    const suppressedPhones = new Set();
    const suppressedUsers = new Set();

    const subscriberRows = await fetchPaged((offset, upper) =>
        supabase
            .from('newsletter_subscribers')
            .select('id, email, user_id, is_active, source')
            .order('id', { ascending: true })
            .range(offset, upper)
    );

    for (const sub of subscriberRows) {
        const raw = String(sub?.email || '').trim();
        const isInactive = sub?.is_active === false;
        const isPrefSuppressed = isSourceSuppressedForLifecycle(sub?.source, nowMs);
        if (!isInactive && !isPrefSuppressed) continue;

        if (raw.toLowerCase().startsWith('sms:')) {
            const phone = sendablePhone(raw);
            if (phone) suppressedPhones.add(phone);
        } else {
            const email = normalizeDeliverableEmail(raw);
            if (email) suppressedEmails.add(email);
        }
        if (sub?.user_id && (isInactive || isPrefSuppressed)) {
            suppressedUsers.add(String(sub.user_id));
        }
    }

    // 3. Load notification_preferences (mute_all)
    try {
        const prefRows = await fetchPaged((offset, upper) =>
            supabase
                .from('notification_preferences')
                .select('user_id, mute_all')
                .order('user_id', { ascending: true })
                .range(offset, upper)
        );
        for (const pref of prefRows) {
            if (pref?.user_id && pref.mute_all === true) {
                suppressedUsers.add(String(pref.user_id));
            }
        }
    } catch (_prefErr) {
        // Non-fatal in lightweight test mocks without notification_preferences.
    }

    // 4. Load SMS carrier refusals and recent texts from sms_delivery_receipts
    const recentlyTextedPhones = new Set();
    const recentSmsCutoffMs = nowMs - 7 * DAY_MS;
    try {
        const smsReceipts = await fetchPaged((offset, upper) =>
            supabase
                .from('sms_delivery_receipts')
                .select('sid, to_number, status, error_code, updated_at')
                .order('sid', { ascending: true })
                .range(offset, upper)
        );
        for (const rec of smsReceipts) {
            const phone = sendablePhone(rec?.to_number);
            if (!phone) continue;
            const status = String(rec?.status || '').toLowerCase();
            const code = Number(rec?.error_code);
            if ((status === 'undelivered' || status === 'failed') && PERMANENT_SMS_ERROR_CODES.has(code)) {
                suppressedPhones.add(phone);
            }
            const updatedMs = parseTimestampMs(rec?.updated_at);
            if (updatedMs >= recentSmsCutoffMs) {
                recentlyTextedPhones.add(phone);
            }
        }
    } catch (_smsErr) {
        // Non-fatal in lightweight test mocks.
    }

    // 5. Load Welcome-Back promo redemptions (both canonical and legacy code aliases)
    const redeemedWelcomeBackUsers = new Set();
    try {
        const { data: codeRows } = await supabase
            .from('promo_codes')
            .select('id, code')
            .in('code', [WELCOME_BACK_CODE, 'sp_welcome_back_202611']);
        const codeIds = (codeRows || []).map((r) => r?.id).filter(Boolean);
        for (let i = 0; i < codeIds.length; i += IN_BATCH_SIZE) {
            // in-list: bounded by IN_BATCH_SIZE (100)
            const redemptions = await fetchPaged((offset, upper) =>
                supabase
                    .from('promo_code_redemptions')
                    .select('id, promo_code_id, user_id')
                    .in('promo_code_id', codeIds.slice(i, i + IN_BATCH_SIZE))
                    .order('id', { ascending: true })
                    .range(offset, upper)
            );
            for (const r of redemptions) {
                if (r?.user_id) redeemedWelcomeBackUsers.add(String(r.user_id));
            }
        }
    } catch (_redeemErr) {
        // Non-fatal in lightweight test mocks.
    }

    // 6. Load human profiles using strictly verified columns
    const profileRows = await fetchPaged(
        (offset, upper) =>
            supabase
                .from('profiles')
                .select(
                    'id, username, email, phone, phone_verified, diamonds, is_vip, vip_expires_at, player_number, is_horse, created_at, last_active'
                )
                .order('id', { ascending: true })
                .range(offset, upper),
        25000
    );

    const queues = {
        unverified_48h: [],
        welcome_back_21d: [],
        vip_diamond_nudge: [],
    };
    const eligibleTotals = {
        unverified_48h: 0,
        welcome_back_21d: 0,
        vip_diamond_nudge: 0,
    };

    const queuedUsers = new Set();
    const queuedEmails = new Set();
    const queuedSmsPhones = new Set();

    for (const p of profileRows) {
        const id = String(p?.id || '').trim();
        const username = String(p?.username || '').trim();
        if (
            !id ||
            id.startsWith('00000000-0000-0000-0000-') ||
            p?.is_horse === true ||
            SYNTHETIC_USERNAME_RE.test(username) ||
            suppressedUsers.has(id)
        ) {
            continue;
        }

        const cleanEmail = normalizeDeliverableEmail(p?.email);
        const deliverableEmail = cleanEmail && !suppressedEmails.has(cleanEmail) ? cleanEmail : null;
        if (!deliverableEmail) continue;
        if (queuedUsers.has(id) || queuedEmails.has(deliverableEmail)) continue;

        const createdMs = parseTimestampMs(p?.created_at);
        const lastActiveMs = parseTimestampMs(p?.last_active);
        const lastTouchMs = Math.max(createdMs, lastActiveMs);

        // Trigger 1: unverified_48h (48h..14d since signup, phone_verified !== true, once-ever)
        if (p?.phone_verified !== true && createdMs > 0) {
            const signupAgeMs = nowMs - createdMs;
            if (signupAgeMs >= 48 * HOUR_MS && signupAgeMs <= 14 * DAY_MS) {
                const marker = lifecycleMarkerUuid('unverified_48h', id);
                if (!everMarkers.has(marker)) {
                    eligibleTotals.unverified_48h += 1;
                    if (queues.unverified_48h.length < cap) {
                        queues.unverified_48h.push({
                            trigger: 'unverified_48h',
                            userId: id,
                            username,
                            email: deliverableEmail,
                            phone: null,
                            diamonds: Number(p?.diamonds || 0),
                            vipExpiresAt: p?.vip_expires_at || null,
                            markerUuid: marker,
                        });
                        queuedUsers.add(id);
                        queuedEmails.add(deliverableEmail);
                    }
                    continue;
                }
            }
        }

        // Trigger 2: welcome_back_21d (22..30d dormant by default, max once per 90d)
        if (lastTouchMs > 0 && !redeemedWelcomeBackUsers.has(id)) {
            const dormantMs = nowMs - lastTouchMs;
            const inWindow = includeOlderDormant
                ? dormantMs >= 22 * DAY_MS
                : dormantMs >= 22 * DAY_MS && dormantMs <= 30 * DAY_MS;
            if (inWindow) {
                const marker = lifecycleMarkerUuid('welcome_back_21d', id);
                if (!markers90d.has(marker)) {
                    eligibleTotals.welcome_back_21d += 1;
                    if (queues.welcome_back_21d.length < cap) {
                        const candidatePhone = p?.phone_verified === true ? sendablePhone(p?.phone) : null;
                        const smsPhone =
                            candidatePhone &&
                            !suppressedPhones.has(candidatePhone) &&
                            !recentlyTextedPhones.has(candidatePhone) &&
                            !queuedSmsPhones.has(candidatePhone)
                                ? candidatePhone
                                : null;
                        if (smsPhone) queuedSmsPhones.add(smsPhone);
                        queues.welcome_back_21d.push({
                            trigger: 'welcome_back_21d',
                            userId: id,
                            username,
                            email: deliverableEmail,
                            phone: smsPhone,
                            diamonds: Number(p?.diamonds || 0),
                            vipExpiresAt: p?.vip_expires_at || null,
                            markerUuid: marker,
                        });
                        queuedUsers.add(id);
                        queuedEmails.add(deliverableEmail);
                    }
                    continue;
                }
            }
        }

        // Trigger 3: vip_diamond_nudge (vip_expires_at within +/-3d OR diamonds >= 500 & inactive 14..20d, max once per 60d)
        const vipExpMs = parseTimestampMs(p?.vip_expires_at);
        const diamonds = Number(p?.diamonds || 0);
        const dormantMs = lastTouchMs > 0 ? nowMs - lastTouchMs : 0;
        const vipExpiringSoon = vipExpMs > 0 && vipExpMs >= nowMs - 3 * DAY_MS && vipExpMs <= nowMs + 3 * DAY_MS;
        const dormantDiamonds = diamonds >= 500 && dormantMs >= 14 * DAY_MS && dormantMs <= 20 * DAY_MS;

        if (vipExpiringSoon || dormantDiamonds) {
            const marker = lifecycleMarkerUuid('vip_diamond_nudge', id);
            if (!markers60d.has(marker)) {
                eligibleTotals.vip_diamond_nudge += 1;
                if (queues.vip_diamond_nudge.length < cap) {
                    queues.vip_diamond_nudge.push({
                        trigger: 'vip_diamond_nudge',
                        userId: id,
                        username,
                        email: deliverableEmail,
                        phone: null,
                        diamonds,
                        vipExpiresAt: p?.vip_expires_at || null,
                        reason: vipExpiringSoon ? 'vip_window' : 'unclaimed_diamonds',
                        markerUuid: marker,
                    });
                    queuedUsers.add(id);
                    queuedEmails.add(deliverableEmail);
                }
            }
        }
    }

    const dueCandidates = [
        ...queues.unverified_48h,
        ...queues.welcome_back_21d,
        ...queues.vip_diamond_nudge,
    ];

    const counts = {
        unverified_48h: queues.unverified_48h.length,
        welcome_back_21d: queues.welcome_back_21d.length,
        vip_diamond_nudge: queues.vip_diamond_nudge.length,
    };

    if (dryRun) {
        const sampleUnsub = `${cleanSite}/api/news/subscribe?unsubscribe=preview`;
        const samplePrefs = `${cleanSite}/hub/email-preferences?token=preview`;
        return {
            success: true,
            dryRun: true,
            alreadyRanToday,
            from,
            emailConfigured,
            smsConfigured,
            dueTotal: dueCandidates.length,
            counts,
            eligibleTotals,
            smsCandidates: queues.welcome_back_21d.filter((c) => Boolean(c.phone)).length,
            suppressedEmails: suppressedEmails.size,
            suppressedPhones: suppressedPhones.size,
            samplePreviews: {
                unverified_48h: renderLifecycleEmail({
                    trigger: 'unverified_48h',
                    username: 'grinder',
                    siteUrl: cleanSite,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePrefs,
                    nowMs,
                }).subject,
                welcome_back_21d: renderLifecycleEmail({
                    trigger: 'welcome_back_21d',
                    username: 'grinder',
                    siteUrl: cleanSite,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePrefs,
                    nowMs,
                }).subject,
                vip_diamond_nudge: renderLifecycleEmail({
                    trigger: 'vip_diamond_nudge',
                    username: 'grinder',
                    diamonds: 1200,
                    siteUrl: cleanSite,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePrefs,
                    nowMs,
                }).subject,
            },
            sent: 0,
            emailSent: 0,
            smsSent: 0,
            failed: 0,
        };
    }

    if (dueCandidates.length === 0) {
        return {
            success: true,
            dryRun: false,
            alreadyRanToday,
            dueTotal: 0,
            counts,
            eligibleTotals,
            sent: 0,
            emailSent: 0,
            smsSent: 0,
            failed: 0,
            campaignId: null,
            message: 'No lifecycle retention triggers are currently due.',
        };
    }

    if (!emailConfigured && sendEmailFn === defaultSendLifecycleEmail) {
        throw new Error('Email provider is not configured for lifecycle dispatch.');
    }

    // Create audit row in newsletter_campaigns before sending so campaign_id tags attach cleanly
    const plannedMarkers = dueCandidates.map((c) => c.markerUuid);
    const { data: campaignRow, error: insertErr } = await supabase
        .from('newsletter_campaigns')
        .insert({
            subject: LIFECYCLE_CAMPAIGN_SUBJECT,
            status: 'sending',
            audience: 'active_subscribers',
            lookback_days: 7,
            article_limit: 3,
            article_ids: plannedMarkers,
            recipient_count: dueCandidates.length,
            sent_count: 0,
            failed_count: 0,
            created_by: createdBy || null,
        })
        .select('id')
        .maybeSingle();

    if (insertErr) throw insertErr;
    const campaignId = campaignRow?.id || null;

    let emailSent = 0;
    let emailFailed = 0;
    let smsSent = 0;
    let smsFailed = 0;
    const recordedMarkers = [];
    const errors = [];
    const smsText = buildWelcomeBackLifecycleSms();

    for (const candidate of dueCandidates) {
        const unsubToken = makeUnsubscribeToken(candidate.email);
        const unsubUrl = `${cleanSite}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
        const preferencesUrl = `${cleanSite}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
        const rendered = renderLifecycleEmail({
            trigger: candidate.trigger,
            username: candidate.username,
            userId: candidate.userId,
            diamonds: candidate.diamonds,
            vipExpiresAt: candidate.vipExpiresAt,
            siteUrl: cleanSite,
            unsubscribeUrl: unsubUrl,
            preferencesUrl,
            nowMs,
        });

        let deliveredAny = false;
        const emailRes = await sendEmailFn({
            to: [candidate.email],
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            from: process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM,
            idempotencyKey: `lifecycle-${candidate.markerUuid}-${new Date(nowMs).toISOString().slice(0, 10)}`,
            headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            tags: campaignId ? [{ name: 'campaign_id', value: String(campaignId) }] : undefined,
        });

        if (emailRes?.ok) {
            emailSent += 1;
            deliveredAny = true;
        } else {
            emailFailed += 1;
            if (emailRes?.error && errors.length < 5) {
                errors.push(`${candidate.trigger}: ${emailRes.error}`);
            }
        }

        if (candidate.trigger === 'welcome_back_21d' && candidate.phone && (smsConfigured || sendSmsFn !== defaultSendSms)) {
            const smsRes = await sendSmsFn(smsText, { to: candidate.phone, sb: supabase });
            if (smsRes?.ok) {
                smsSent += 1;
                deliveredAny = true;
            } else if (!smsRes?.suppressed) {
                smsFailed += 1;
                if (smsRes?.error && errors.length < 5) {
                    errors.push(`sms: ${smsRes.error}`);
                }
            }
        }

        if (deliveredAny) {
            recordedMarkers.push(candidate.markerUuid);
        }
    }

    const totalSent = emailSent + smsSent;
    const totalFailed = emailFailed + smsFailed;
    const finalStatus = totalFailed === 0 ? 'sent' : totalSent > 0 ? 'partial' : 'failed';
    const completedIso = new Date().toISOString();

    if (campaignId) {
        await supabase
            .from('newsletter_campaigns')
            .update({
                status: finalStatus,
                article_ids: recordedMarkers,
                sent_count: totalSent,
                failed_count: totalFailed,
                error_summary: errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null,
                completed_at: completedIso,
                updated_at: completedIso,
            })
            .eq('id', campaignId);
    }

    return {
        success: totalFailed === 0,
        dryRun: false,
        campaignId,
        status: finalStatus,
        dueTotal: dueCandidates.length,
        counts,
        eligibleTotals,
        sent: totalSent,
        emailSent,
        smsSent,
        failed: totalFailed,
        recordedMarkersCount: recordedMarkers.length,
        errors: errors.length > 0 ? errors : undefined,
    };
}
