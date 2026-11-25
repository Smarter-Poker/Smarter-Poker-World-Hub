/**
 * Promotional Email & SMS Campaign Engine (World Hub)
 *
 * Unifies:
 *   1. Bulk lead import (emails + E.164 phones) into newsletter_subscribers
 *      while permanently honoring prior unsubscribes, bounces, and STOP opt-outs.
 *   2. Database-wide audience resolution across newsletter_subscribers,
 *      profiles / auth.users, commander_members, commander_onboarding_leads,
 *      commander_leads, and commander_home_members.
 *   3. CAN-SPAM & carrier-compliant Promotional Email + SMS preview, single-recipient
 *      test send, and audited batch dispatch (newsletter_campaigns).
 *
 * Uses resendAccount.mjs (Pro Resend account on mail.smarter.poker when
 * RESEND_BULK_API_KEY is configured) and delivery.mjs sendSms (Twilio with
 * StatusCallback + carrier suppression check).
 */
import crypto from 'crypto';
import { resendApiKey, resendFrom } from '../email/resendAccount.mjs';
import {
    filterSuppressedPhones,
    sendEmail as defaultSendSingleEmail,
    sendSms as defaultSendSms,
} from '../dailyDigest/delivery.mjs';
import { buildPromoSignupUrl } from './promoSignupToken.mjs';
import {
    DEFAULT_WELCOME_BACK_DRAFT,
    WELCOME_BACK_CODE,
    WELCOME_BACK_INACTIVE_DAYS,
    buildWelcomeBackOfferUrl,
    isWelcomeBackCtaUrl,
} from './welcomeBackOffer.mjs';
import { buildMastheadCrestUrl } from '../newsletter/emailImageProxy.mjs';
import { mergeFinalCampaignErrorSummary } from '../newsletter/campaignTelemetry.mjs';

export { DEFAULT_WELCOME_BACK_DRAFT };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_SCAN_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const MAX_EMAIL_LENGTH = 254;

const SYNTHETIC_EMAIL_RE = /(?:\.invalid|\.local|\.test|@(?:[a-z0-9-]+\.)*smarter\.poker|@horse\.ai|@hydra\.bot|@example\.(?:com|org|net)|@(?:email|test)\.com)$/i;
const SYNTHETIC_USERNAME_RE = /^(?:deleted-|crest_cert_|postdeploy|reels_qa|trivia_canary|codex-)/i;

const PAGE_SIZE = 1000;
const IMPORT_CHUNK_SIZE = 200;
const EMAIL_BATCH_SIZE = 100;
const SMS_CONCURRENCY = 4;
const MAX_PROMO_EMAILS = 10000;
const MAX_PROMO_PHONES = 5000;

export const DEFAULT_PROMO_FROM = 'Smarter.Poker News <news@smarter.poker>';
export const DEFAULT_SITE_URL = 'https://smarter.poker';
export const DEFAULT_POSTAL_ADDRESS = 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453';

export const DEFAULT_PROMO_DRAFT = {
    subject: 'Claim 25 Free Chips, 30-Day Free VIP & 500 Free Diamonds on Smarter.Poker',
    headline: '25 Free Chips + 30-Day Free VIP + 500 Free Diamonds',
    body: 'Train with GTO poker tools, discover live poker games near you, and take a seat in Club Arena on Smarter.Poker.\n\nCreate your free account through this exclusive promotion and verify your phone number to instantly receive 25 Free Chips in Kings Club (Club Code 25450), a 30-Day Free VIP Card, and 500 Free Diamonds.',
    ctaLabel: 'Claim Your Free Rewards',
    ctaUrl: 'https://smarter.poker/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450',
    smsBody: 'Smarter.Poker: Claim 25 Free Chips + 30-Day Free VIP + 500 Free Diamonds in Kings Club (Code 25450): https://smarter.poker/go/promo Reply STOP to opt out.',
    postalAddress: DEFAULT_POSTAL_ADDRESS,
    channels: 'both',
    scope: 'non_accounts',
};

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function unsubscribeSecret() {
    return (
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    );
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeUnsubscribeToken(email) {
    const secret = unsubscribeSecret();
    const normalized = String(email || '').trim().toLowerCase();
    if (!secret) return normalized;
    const payload = b64url(Buffer.from(normalized, 'utf8'));
    const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    return `${payload}.${sig}`;
}

export function normalizeDeliverableEmail(raw) {
    const email = String(raw || '').trim().toLowerCase().replace(/^[<("']+|[>)"',;]+$/g, '');
    if (!email || email.length > MAX_EMAIL_LENGTH) return null;
    if (!EMAIL_RE.test(email)) return null;
    if (SYNTHETIC_EMAIL_RE.test(email)) return null;
    return email;
}

/**
 * Validate an explicit admin test-send target email. Unlike mass audience
 * resolution (which excludes internal @smarter.poker horse/probe addresses),
 * an administrator testing their own @smarter.poker inbox must be permitted.
 */
export function normalizeExplicitTestEmail(raw) {
    const email = String(raw || '').trim().toLowerCase().replace(/^[<("']+|[>)"',;]+$/g, '');
    if (!email || email.length > MAX_EMAIL_LENGTH) return null;
    if (!EMAIL_RE.test(email)) return null;
    if (/(?:\.invalid|\.local)$/i.test(email)) return null;
    return email;
}

export function verifyOperatorTestSignature({
    action,
    testEmail = '',
    testPhone = '',
    confirmSend = '',
    timestampHeader = '',
    signatureHeader = '',
    secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    nowMs = Date.now(),
} = {}) {
    const isSend = action === 'send';
    if (action !== 'test' && action !== 'preview' && !isSend) return false;
    if (isSend && String(confirmSend || '').trim() !== 'SEND_LIVE_PROMO') return false;
    const key = String(secret || '').trim();
    const tsRaw = String(timestampHeader || '').trim();
    const sigRaw = String(signatureHeader || '').trim().toLowerCase();
    if (!key || !/^\d{10,13}$/.test(tsRaw) || !/^[0-9a-f]{64}$/.test(sigRaw)) return false;
    const tsSec = tsRaw.length > 10 ? Math.floor(Number(tsRaw) / 1000) : Number(tsRaw);
    const nowSec = Math.floor(nowMs / 1000);
    if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 90) return false;
    const baseMsg = `${tsRaw}:${action}:${String(testEmail || '').trim().toLowerCase()}:${String(testPhone || '').trim()}`;
    const msg = isSend ? `${baseMsg}:SEND_LIVE_PROMO` : baseMsg;
    const expected = crypto.createHmac('sha256', key).update(msg).digest('hex');
    const a = Buffer.from(sigRaw, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sendablePhone(raw) {
    const text = String(raw || '').trim();
    const withoutPrefix = text.startsWith('sms:') ? text.slice(4) : text;
    const digits = withoutPrefix.replace(/\D/g, '');
    if (!digits || digits.startsWith('0')) return null;
    let normalized = null;
    if (digits.length === 10) normalized = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) normalized = `+${digits}`;
    else if (digits.length >= 10 && digits.length <= 15) normalized = `+${digits}`;
    if (!normalized) return null;
    // Enforce strict NANPA rules on +1 numbers: area code and exchange must start
    // with 2-9, area code cannot be 555 (demo seed rows use 555-100/200/999), and
    // 555-01XX fictional directory range is excluded.
    if (normalized.startsWith('+1')) {
        const area = normalized.slice(2, 5);
        const exchange = normalized.slice(5, 8);
        const line = normalized.slice(8, 12);
        if (area[0] === '0' || area[0] === '1' || area === '555') return null;
        if (exchange[0] === '0' || exchange[0] === '1') return null;
        if (exchange === '555' && Number(line) >= 100 && Number(line) <= 199) return null;
    }
    return normalized;
}

/**
 * Parse any freeform pasted list (newlines, commas, semicolons, CSV rows) into
 * deduplicated deliverable emails and E.164 phone numbers.
 */
export function parseLeadInput(rawText) {
    const text = String(rawText || '');
    const emailSet = new Set();
    const phoneSet = new Set();
    let invalidCount = 0;

    // Extract all emails first, then inspect remaining tokens for phones.
    const matches = text.match(EMAIL_SCAN_RE) || [];
    for (const m of matches) {
        const clean = normalizeDeliverableEmail(m);
        if (clean) emailSet.add(clean);
        else invalidCount += 1;
    }

    const stripped = text.replace(EMAIL_SCAN_RE, ' ');
    const tokens = stripped
        .split(/[\n\r,;|\t]+/)
        .map((t) => t.trim())
        .filter(Boolean);

    for (const token of tokens) {
        const digitCount = token.replace(/\D/g, '').length;
        if (digitCount === 0) continue;
        const phone = sendablePhone(token);
        if (phone) phoneSet.add(phone);
        else invalidCount += 1;
    }

    return {
        emails: [...emailSet],
        phones: [...phoneSet],
        invalidCount,
    };
}

export function isAllowedSmarterPokerUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return false;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') return false;
        return parsed.hostname === 'smarter.poker' || parsed.hostname.endsWith('.smarter.poker');
    } catch {
        return false;
    }
}

export function ensureSmsStopFooter(rawSms) {
    const trimmed = String(rawSms || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';
    if (/\bstop\b/i.test(trimmed)) return trimmed.slice(0, 480);
    return `${trimmed} Reply STOP to opt out.`.slice(0, 480);
}

export function renderPromoEmail({
    subject,
    headline,
    body,
    ctaLabel,
    ctaUrl,
    postalAddress = DEFAULT_POSTAL_ADDRESS,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    preferencesUrl = '',
    preheader = '',
}) {
    const cleanCopy = (val) => String(val || '').replace(/[—–]/g, '-');
    const cleanSubject = cleanCopy(subject);
    const cleanHeadline = cleanCopy(headline || subject);
    const safeHeadline = escapeHtml(cleanHeadline);
    const paragraphs = cleanCopy(body)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
    const htmlParagraphs = paragraphs
        .map(
            (p) =>
                `<p style="margin:0 0 16px 0;color:#d6e3f0;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`
        )
        .join('');
    const cleanSite = String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const safeCtaUrl = escapeHtml(ctaUrl);
    const safeCtaLabel = escapeHtml(cleanCopy(ctaLabel || 'Get Started'));
    const safeUnsub = escapeHtml(unsubscribeUrl || `${cleanSite}/api/news/subscribe?unsubscribe=preview`);
    const safePrefs = escapeHtml(preferencesUrl || unsubscribeUrl || `${cleanSite}/hub/email-preferences`);
    const safeArchive = escapeHtml(`${cleanSite}/hub/wire`);
    const safePostal = escapeHtml(cleanCopy(postalAddress || DEFAULT_POSTAL_ADDRESS));
    const safeSite = escapeHtml(cleanSite);
    const safeCrestUrl = escapeHtml(buildMastheadCrestUrl({ siteUrl: cleanSite }));
    const resolvedPreheader = cleanCopy(preheader || paragraphs[0] || cleanHeadline).slice(0, 160);

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(cleanSubject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#e7edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(resolvedPreheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b1118;border:1px solid #1b2c3d;border-radius:14px;">
<tr><td style="padding:32px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${safeCrestUrl}" alt="Smarter.Poker" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;border:0;" /></td>
<td valign="middle"><div style="color:#4fc1b3;font-size:13px;font-weight:800;letter-spacing:2.8px;text-transform:uppercase;">SMARTER.POKER</div></td>
</tr></table>
<h1 style="margin:14px 0 18px 0;color:#ffffff;font-size:24px;line-height:1.25;font-weight:800;">${safeHeadline}</h1>
${htmlParagraphs}
<div style="padding:8px 0 24px 0;">
<a href="${safeCtaUrl}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:15px;padding:14px 28px;border-radius:8px;">${safeCtaLabel}</a>
</div>
<div style="border-top:1px solid #1c2a38;padding-top:18px;color:#7f93a8;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${safePostal}</div>
<div style="margin-top:6px;">
<a href="${safePrefs}" style="color:#60a5fa;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${safeUnsub}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a> &middot;
<a href="${safeArchive}" style="color:#9fb3c8;text-decoration:underline;">Web Archive</a> &middot;
<a href="${safeSite}" style="color:#9fb3c8;text-decoration:underline;">Visit Smarter.Poker</a>
</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const text = [
        'SMARTER.POKER',
        '',
        cleanHeadline,
        '',
        ...paragraphs.flatMap((p) => [p, '']),
        `${cleanCopy(ctaLabel || 'Get Started')}: ${ctaUrl}`,
        '',
        '---',
        `Smarter.Poker | ${cleanCopy(postalAddress || DEFAULT_POSTAL_ADDRESS)}`,
        `Email Preferences: ${preferencesUrl || unsubscribeUrl}`,
        `Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');

    return { html, text };
}

/**
 * Bulk-import emails and/or phones into newsletter_subscribers without ever
 * reactivating an address or phone that previously opted out or bounced.
 */
export async function importMarketingLeads(sb, { rawText = '', emails = [], phones = [], source = 'admin_import' } = {}) {
    const parsed = parseLeadInput(rawText);
    const emailSet = new Set(parsed.emails);
    const phoneSet = new Set(parsed.phones);
    let invalidSkipped = parsed.invalidCount;

    for (const item of Array.isArray(emails) ? emails : []) {
        const clean = normalizeDeliverableEmail(item);
        if (clean) emailSet.add(clean);
        else invalidSkipped += 1;
    }
    for (const item of Array.isArray(phones) ? phones : []) {
        const clean = sendablePhone(item);
        if (clean) phoneSet.add(clean);
        else invalidSkipped += 1;
    }

    const safeSource = /^[a-z0-9_-]{1,40}$/i.test(String(source || '')) ? String(source) : 'admin_import';
    const candidateEmails = [...emailSet];
    const suppressedCarrierPhones = await filterSuppressedPhones(sb, [...phoneSet]);
    let carrierSuppressedSkipped = 0;
    const deliverablePhones = [];
    for (const p of phoneSet) {
        if (suppressedCarrierPhones.has(p)) {
            carrierSuppressedSkipped += 1;
        } else {
            deliverablePhones.push(p);
        }
    }
    const candidateSmsKeys = deliverablePhones.map((p) => `sms:${p}`);
    const allKeys = [...candidateEmails, ...candidateSmsKeys];

    let importedEmails = 0;
    let importedPhones = 0;
    let alreadyActiveEmails = 0;
    let alreadyActivePhones = 0;
    let optedOutPreserved = carrierSuppressedSkipped;

    for (let i = 0; i < allKeys.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = allKeys.slice(i, i + IMPORT_CHUNK_SIZE);
        // in-list: bounded by IMPORT_CHUNK_SIZE (200)
        const { data: existingRows, error: readErr } = await sb
            .from('newsletter_subscribers')
            .select('email, is_active')
            .in('email', allKeys.slice(i, i + IMPORT_CHUNK_SIZE));
        if (readErr) throw readErr;

        const existingMap = new Map();
        for (const row of existingRows || []) {
            existingMap.set(String(row.email || '').trim().toLowerCase(), row.is_active);
        }

        const toInsert = [];
        const nowIso = new Date().toISOString();
        for (const key of chunk) {
            const normalizedKey = key.toLowerCase();
            const isSms = normalizedKey.startsWith('sms:');
            if (existingMap.has(normalizedKey)) {
                const active = existingMap.get(normalizedKey);
                if (active === false) {
                    optedOutPreserved += 1;
                } else if (isSms) {
                    alreadyActivePhones += 1;
                } else {
                    alreadyActiveEmails += 1;
                }
                continue;
            }
            toInsert.push({
                email: isSms ? key : normalizedKey,
                is_active: true,
                source: isSms ? `sms_${safeSource}` : safeSource,
                subscribed_at: nowIso,
            });
        }

        if (toInsert.length > 0) {
            const { error: insertErr } = await sb.from('newsletter_subscribers').insert(toInsert);
            if (insertErr) throw insertErr;
            for (const item of toInsert) {
                if (String(item.email).startsWith('sms:')) importedPhones += 1;
                else importedEmails += 1;
            }
        }
    }

    return {
        importedEmails,
        importedPhones,
        alreadyActiveEmails,
        alreadyActivePhones,
        optedOutPreserved,
        invalidSkipped,
        parsedEmails: candidateEmails.length,
        parsedPhones: candidateSmsKeys.length,
    };
}

async function fetchPaged(queryBuilderFactory, maxRows = 15000) {
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

/**
 * Resolve the complete deduplicated, suppression-filtered promotional audience.
 *
 * scope === 'non_accounts' (default) includes active newsletter_subscribers +
 * Commander non-account leads/members while strictly excluding any email, phone,
 * or user_id that already belongs to an existing Smarter.Poker account
 * (profiles / auth.users) or Club Arena membership (club_members).
 * scope === 'inactive_21d' includes ONLY existing real human Smarter.Poker
 * accounts with zero sign-in, Club Arena, browser-binding, or training activity
 * in the past 21 days (and who have not yet accepted WELCOME_BACK_3WK_202611).
 * scope === 'all' merges newsletter_subscribers + profiles + auth.users +
 * commander_members + commander_onboarding_leads + commander_leads +
 * commander_home_members.
 * scope === 'subscribers_only' uses active newsletter_subscribers only.
 */
export async function resolvePromoAudience(
    sb,
    { scope = 'non_accounts', nowMs = Date.now(), minInactiveDays = WELCOME_BACK_INACTIVE_DAYS } = {}
) {
    const cleanScope = ['non_accounts', 'inactive_21d', 'subscribers_only', 'all'].includes(scope)
        ? scope
        : 'non_accounts';
    const suppressedEmails = new Set();
    const suppressedPhones = new Set();
    const emailMutedUsers = new Set();
    const smsMutedUsers = new Set();
    const existingAccountUserIds = new Set();
    const existingAccountEmails = new Set();
    const existingAccountPhones = new Set();
    const existingAccountPhoneDigits10 = new Set();
    const emailToUserId = new Map();

    const maxTs = (...vals) => {
        let best = 0;
        for (const v of vals) {
            if (!v) continue;
            const ms = typeof v === 'number' ? v : Date.parse(String(v));
            if (Number.isFinite(ms) && ms > best) best = ms;
        }
        return best;
    };

    const phoneDigits10 = (raw) => {
        const d = String(raw || '').replace(/\D/g, '');
        return d.length >= 10 ? d.slice(-10) : '';
    };

    const recordExistingEmail = (raw) => {
        const lowered = String(raw || '').trim().toLowerCase().replace(/^[<("']+|[>)"',;]+$/g, '');
        if (lowered) existingAccountEmails.add(lowered);
        const clean = normalizeDeliverableEmail(raw);
        if (clean) existingAccountEmails.add(clean);
    };

    const recordExistingPhone = (raw) => {
        const clean = sendablePhone(raw);
        if (clean) existingAccountPhones.add(clean);
        const d10 = phoneDigits10(raw);
        if (d10) existingAccountPhoneDigits10.add(d10);
    };

    // 1. Explicit newsletter / SMS opt-outs, bounces, wire-only preferences, and active 30d snoozes
    const inactiveSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('email')
            .eq('is_active', false)
            .order('id', { ascending: true })
            .range(from, to)
    );
    for (const row of inactiveSubs) {
        const raw = String(row?.email || '').trim();
        if (raw.toLowerCase().startsWith('sms:')) {
            const phone = sendablePhone(raw);
            if (phone) suppressedPhones.add(phone);
        } else {
            const email = normalizeDeliverableEmail(raw);
            if (email) suppressedEmails.add(email);
        }
    }

    const isPromoPrefSuppressed = (sourceVal) => {
        const src = String(sourceVal || '').trim();
        if (!src) return false;
        if (src === 'pref:wire_only') return true;
        if (src.toLowerCase().startsWith('snooze:')) {
            const rawTs = src.slice('snooze:'.length).trim();
            const untilMs = /^\d{10,13}$/.test(rawTs)
                ? (rawTs.length === 10 ? Number(rawTs) * 1000 : Number(rawTs))
                : Date.parse(rawTs);
            if (Number.isFinite(untilMs) && untilMs > nowMs) return true;
        }
        return false;
    };

    const activeSubs = await fetchPaged((from, to) =>
        sb
            .from('newsletter_subscribers')
            .select('id, email, is_active, user_id, source')
            .or('is_active.is.null,is_active.eq.true')
            .order('id', { ascending: true })
            .range(from, to)
    );
    for (const row of activeSubs) {
        if (!isPromoPrefSuppressed(row?.source)) continue;
        const raw = String(row?.email || '').trim();
        if (raw.toLowerCase().startsWith('sms:')) {
            const phone = sendablePhone(raw);
            if (phone) suppressedPhones.add(phone);
        } else {
            const email = normalizeDeliverableEmail(raw);
            if (email) suppressedEmails.add(email);
        }
        if (row?.user_id) {
            emailMutedUsers.add(String(row.user_id));
            smsMutedUsers.add(String(row.user_id));
        }
    }

    // 2. User notification preferences
    try {
        const prefs = await fetchPaged((from, to) =>
            sb
                .from('notification_preferences')
                .select('user_id, mute_all, marketing_enabled, email_enabled, sms_enabled')
                .order('user_id', { ascending: true })
                .range(from, to)
        );
        for (const p of prefs) {
            if (!p?.user_id) continue;
            if (p.mute_all === true || p.marketing_enabled === false || p.email_enabled === false) {
                emailMutedUsers.add(p.user_id);
            }
            if (p.mute_all === true || p.marketing_enabled === false || p.sms_enabled === false) {
                smsMutedUsers.add(p.user_id);
            }
        }
    } catch (_prefErr) {
        // Continue with explicit subscriber/carrier suppressions if preferences table unavailable in a mock.
    }

    // 3. Permanent carrier SMS refusals and carrier STOP codes (21610)
    try {
        const failedSms = await fetchPaged((from, to) =>
            sb
                .from('sms_delivery_receipts')
                .select('to_number, status, error_code')
                .in('status', ['undelivered', 'failed'])
                .in('error_code', [30004, 30005, 30006, 21211, 21610, 21614])
                .order('sid', { ascending: true })
                .range(from, to)
        );
        for (const r of failedSms) {
            const phone = sendablePhone(r?.to_number);
            if (phone) suppressedPhones.add(phone);
        }
    } catch (_smsReceiptErr) {
        // Non-fatal in unit mocks; sendSms also calls fn_sms_number_is_suppressed per recipient.
    }

    // Load profiles, auth.users, and club_members when needed for 'non_accounts', 'inactive_21d', or 'all'
    let loadedProfiles = [];
    const loadedAuthUsers = [];
    const clubActivityByUser = new Map();
    const browserSeenByUser = new Map();
    const trainingSeenByUser = new Map();
    const alreadyRedeemedWelcomeBackUsers = new Set();

    if (cleanScope === 'non_accounts' || cleanScope === 'inactive_21d' || cleanScope === 'all') {
        loadedProfiles = await fetchPaged(
            (from, to) =>
                sb
                    .from('profiles')
                    .select(
                        cleanScope === 'inactive_21d'
                            ? 'id, email, phone, username, is_horse, created_at, last_login, last_active, last_seen'
                            : 'id, email, phone, username'
                    )
                    .order('id', { ascending: true })
                    .range(from, to),
            25000
        );
        for (const p of loadedProfiles) {
            if (p?.id) existingAccountUserIds.add(String(p.id));
            if (p?.email) recordExistingEmail(p.email);
            if (p?.phone) recordExistingPhone(p.phone);
        }

        if (sb?.auth?.admin?.listUsers) {
            try {
                for (let page = 1; page <= 20; page += 1) {
                    const { data: authPage, error: authErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
                    if (authErr || !authPage?.users?.length) break;
                    for (const u of authPage.users) {
                        loadedAuthUsers.push(u);
                        if (u?.id) existingAccountUserIds.add(String(u.id));
                        if (u?.email) recordExistingEmail(u.email);
                        if (u?.phone) recordExistingPhone(u.phone);
                    }
                    if (authPage.users.length < 1000) break;
                }
            } catch (_authListErr) {
                // Continue gracefully if auth admin API is unavailable.
            }
        }

        if (cleanScope === 'non_accounts' || cleanScope === 'inactive_21d') {
            try {
                const clubMembers = await fetchPaged(
                    (from, to) =>
                        sb
                            .from('club_members')
                            .select(
                                cleanScope === 'inactive_21d'
                                    ? 'user_id, is_bot, last_active_at, last_active'
                                    : 'user_id'
                            )
                            .order('user_id', { ascending: true })
                            .range(from, to),
                    25000
                );
                for (const m of clubMembers) {
                    if (!m?.user_id) continue;
                    const uid = String(m.user_id);
                    existingAccountUserIds.add(uid);
                    if (cleanScope === 'inactive_21d' && m.is_bot !== true) {
                        const prev = clubActivityByUser.get(uid) || 0;
                        clubActivityByUser.set(uid, Math.max(prev, maxTs(m.last_active_at, m.last_active)));
                    }
                }
            } catch (_clubMembersErr) {
                // Non-fatal in lightweight test doubles without club_members.
            }
        }

        if (cleanScope === 'inactive_21d') {
            try {
                const bindings = await fetchPaged(
                    (from, to) =>
                        sb
                            .from('ca_browser_bindings')
                            .select('user_id, last_seen')
                            .order('user_id', { ascending: true })
                            .range(from, to),
                    25000
                );
                for (const b of bindings) {
                    if (!b?.user_id) continue;
                    const uid = String(b.user_id);
                    browserSeenByUser.set(uid, Math.max(browserSeenByUser.get(uid) || 0, maxTs(b.last_seen)));
                }
            } catch (_bindingErr) {
                // Non-fatal in lightweight mocks.
            }

            try {
                const trainingRows = await fetchPaged(
                    (from, to) =>
                        sb
                            .from('training_progress')
                            .select('user_id, last_played_at')
                            .order('user_id', { ascending: true })
                            .range(from, to),
                    25000
                );
                for (const t of trainingRows) {
                    if (!t?.user_id) continue;
                    const uid = String(t.user_id);
                    trainingSeenByUser.set(uid, Math.max(trainingSeenByUser.get(uid) || 0, maxTs(t.last_played_at)));
                }
            } catch (_trainingErr) {
                // Non-fatal in lightweight mocks.
            }

            try {
                const { data: wbCodes } = await sb
                    .from('promo_codes')
                    .select('id, code')
                    .in('code', [WELCOME_BACK_CODE, 'sp_welcome_back_202611']);
                const wbCodeIds = (wbCodes || []).map((r) => r?.id).filter(Boolean);
                if (wbCodeIds.length > 0) {
                    // in-list: bounded by welcome-back code variants (<= 2)
                    const redemptions = await fetchPaged(
                        (from, to) =>
                            sb
                                .from('promo_code_redemptions')
                                .select('user_id, reward_applied')
                                .in('promo_code_id', wbCodeIds.slice(0, 10))
                                .order('id', { ascending: true })
                                .range(from, to),
                        25000
                    );
                    for (const r of redemptions) {
                        if (r?.user_id && r?.reward_applied) {
                            alreadyRedeemedWelcomeBackUsers.add(String(r.user_id));
                        }
                    }
                }
            } catch (_redeemErr) {
                // Non-fatal in lightweight mocks.
            }
        }
    }

    const emails = new Set();
    const phones = new Set();
    const breakdown = {
        subscriberEmails: 0,
        subscriberPhones: 0,
        profileEmails: 0,
        profilePhones: 0,
        commanderEmails: 0,
        commanderPhones: 0,
        excludedExistingAccounts: 0,
        excludedRecentActiveUsers: 0,
        inactiveEligibleAccounts: 0,
        suppressedEmails: suppressedEmails.size,
        suppressedPhones: suppressedPhones.size,
    };

    const addEmail = (raw, bucket, userId = '') => {
        if (emails.size >= MAX_PROMO_EMAILS) return;
        const clean = normalizeDeliverableEmail(raw);
        if (!clean || suppressedEmails.has(clean) || emails.has(clean)) return;
        if (cleanScope === 'non_accounts' && existingAccountEmails.has(clean)) {
            breakdown.excludedExistingAccounts += 1;
            return;
        }
        emails.add(clean);
        if (userId && !emailToUserId.has(clean)) {
            emailToUserId.set(clean, String(userId));
        }
        breakdown[bucket] = (breakdown[bucket] || 0) + 1;
    };

    const addPhone = (raw, bucket) => {
        if (phones.size >= MAX_PROMO_PHONES) return;
        const clean = sendablePhone(raw);
        if (!clean || suppressedPhones.has(clean) || phones.has(clean)) return;
        if (
            cleanScope === 'non_accounts' &&
            (existingAccountPhones.has(clean) || existingAccountPhoneDigits10.has(phoneDigits10(clean)))
        ) {
            breakdown.excludedExistingAccounts += 1;
            return;
        }
        phones.add(clean);
        breakdown[bucket] = (breakdown[bucket] || 0) + 1;
    };

    if (cleanScope === 'inactive_21d') {
        const cutoffMs = nowMs - Math.max(1, Number(minInactiveDays) || WELCOME_BACK_INACTIVE_DAYS) * 86_400_000;
        const authById = new Map();
        for (const u of loadedAuthUsers) {
            if (u?.id) authById.set(String(u.id), u);
        }

        const seenUserIds = new Set();
        for (const p of loadedProfiles) {
            const id = String(p?.id || '');
            const uname = String(p?.username || '');
            const authUser = authById.get(id);
            if (
                !id ||
                id.startsWith('00000000-0000-0000-0000-') ||
                p?.is_horse === true ||
                authUser?.is_anonymous === true ||
                SYNTHETIC_USERNAME_RE.test(uname)
            ) {
                continue;
            }
            seenUserIds.add(id);
            if (alreadyRedeemedWelcomeBackUsers.has(id)) continue;

            const lastTouchMs = maxTs(
                p.created_at,
                p.last_login,
                p.last_active,
                p.last_seen,
                authUser?.created_at,
                authUser?.last_sign_in_at,
                clubActivityByUser.get(id) || 0,
                browserSeenByUser.get(id) || 0,
                trainingSeenByUser.get(id) || 0
            );

            if (lastTouchMs >= cutoffMs) {
                breakdown.excludedRecentActiveUsers += 1;
                continue;
            }

            breakdown.inactiveEligibleAccounts += 1;
            const candidateEmail = p.email || authUser?.email || '';
            const candidatePhone = p.phone || authUser?.phone || '';
            if (!emailMutedUsers.has(id) && candidateEmail) addEmail(candidateEmail, 'profileEmails', id);
            if (!smsMutedUsers.has(id) && candidatePhone) addPhone(candidatePhone, 'profilePhones');
        }

        const inactiveSuppressed = await filterSuppressedPhones(sb, [...phones]);
        if (inactiveSuppressed.size > 0) {
            for (const sp of inactiveSuppressed) phones.delete(sp);
            breakdown.profilePhones = Math.max(0, breakdown.profilePhones - inactiveSuppressed.size);
        }

        return {
            emails: [...emails],
            phones: [...phones],
            emailToUserId,
            breakdown,
        };
    }

    // 4. Active newsletter & imported leads (already loaded above in step 1)
    for (const row of activeSubs) {
        if (isPromoPrefSuppressed(row?.source)) continue;
        if (cleanScope === 'non_accounts' && row?.user_id && existingAccountUserIds.has(String(row.user_id))) {
            breakdown.excludedExistingAccounts += 1;
            continue;
        }
        const raw = String(row?.email || '').trim();
        if (raw.toLowerCase().startsWith('sms:')) {
            addPhone(raw, 'subscriberPhones');
        } else {
            addEmail(raw, 'subscriberEmails');
        }
    }

    // 5. Existing database profiles & auth.users ONLY when cleanScope === 'all',
    //    plus Commander leads/members when cleanScope is 'non_accounts' or 'all'.
    if (cleanScope !== 'subscribers_only') {
        if (cleanScope === 'all') {
            const syntheticUserIds = new Set();
            for (const p of loadedProfiles) {
                const id = String(p?.id || '');
                const uname = String(p?.username || '');
                if (!id || id.startsWith('00000000-0000-0000-0000-') || SYNTHETIC_USERNAME_RE.test(uname)) {
                    if (id) syntheticUserIds.add(id);
                    continue;
                }
                if (!emailMutedUsers.has(id) && p.email) addEmail(p.email, 'profileEmails', id);
                if (!smsMutedUsers.has(id) && p.phone) addPhone(p.phone, 'profilePhones');
            }

            for (const u of loadedAuthUsers) {
                if (!u?.id || u.is_anonymous || syntheticUserIds.has(u.id)) continue;
                if (String(u.id).startsWith('00000000-0000-0000-0000-')) continue;
                if (!emailMutedUsers.has(u.id) && u.email) addEmail(u.email, 'profileEmails', u.id);
                if (!smsMutedUsers.has(u.id) && u.phone) addPhone(u.phone, 'profilePhones');
            }
        }

        // Commander venue members, leads, onboarding leads, and home-game rosters
        const optionalSources = [
            () =>
                fetchPaged((from, to) =>
                    sb.from('commander_members').select('email, phone').order('id', { ascending: true }).range(from, to)
                ),
            () =>
                fetchPaged((from, to) =>
                    sb
                        .from('commander_onboarding_leads')
                        .select('email, phone')
                        .order('id', { ascending: true })
                        .range(from, to)
                ),
            () =>
                fetchPaged((from, to) =>
                    sb.from('commander_leads').select('email').order('id', { ascending: true }).range(from, to)
                ),
            () =>
                fetchPaged((from, to) =>
                    sb.from('commander_home_members').select('phone').order('id', { ascending: true }).range(from, to)
                ),
        ];

        for (const loader of optionalSources) {
            try {
                const rows = await loader();
                for (const r of rows) {
                    if (r?.email) addEmail(r.email, 'commanderEmails');
                    if (r?.phone) addPhone(r.phone, 'commanderPhones');
                }
            } catch (_optionalErr) {
                // Non-blocking if an auxiliary table is empty or omitted in a test double.
            }
        }
    }

    const carrierSuppressed = await filterSuppressedPhones(sb, [...phones]);
    if (carrierSuppressed.size > 0) {
        for (const sp of carrierSuppressed) phones.delete(sp);
    }

    return {
        emails: [...emails],
        phones: [...phones],
        emailToUserId,
        breakdown,
    };
}

function createHttpResendBatchSender(apiKey, fetchImpl = fetch) {
    return {
        batch: {
            async send(payload) {
                const res = await fetchImpl('https://api.resend.com/emails/batch', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    signal: AbortSignal.timeout(20000),
                    body: JSON.stringify(payload),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    return { error: { message: json?.message || `Resend HTTP ${res.status}` } };
                }
                return json;
            },
        },
    };
}

async function sendResendBatch(resend, messages) {
    const attempt = async (payload) => {
        const result = await resend.batch.send(payload);
        if (result?.error) throw new Error(result.error.message || 'Resend batch error');
        return result;
    };

    try {
        await attempt(messages);
        return { sent: messages.length, failed: 0, error: null };
    } catch (_firstErr) {
        try {
            await attempt(messages.map(({ headers, tags, ...rest }) => rest));
            return { sent: messages.length, failed: 0, error: null };
        } catch (retryError) {
            return {
                sent: 0,
                failed: messages.length,
                error: retryError?.message || String(retryError),
            };
        }
    }
}

export async function dispatchPromoCampaign(
    sb,
    {
        subject,
        headline,
        body,
        ctaLabel,
        ctaUrl,
        smsBody,
        postalAddress = DEFAULT_POSTAL_ADDRESS,
        channels = 'both',
        scope = DEFAULT_PROMO_DRAFT.scope,
        dryRun = true,
        testOnly = false,
        testEmail = '',
        testPhone = '',
        createdBy = null,
        resendFactory = null,
        sendSingleEmail = defaultSendSingleEmail,
        sendSms = defaultSendSms,
    } = {}
) {
    const cleanScope = ['non_accounts', 'inactive_21d', 'subscribers_only', 'all'].includes(scope)
        ? scope
        : 'non_accounts';
    const baseDraft = cleanScope === 'inactive_21d' ? DEFAULT_WELCOME_BACK_DRAFT : DEFAULT_PROMO_DRAFT;
    const effectiveResendFactory = resendFactory || ((key) => createHttpResendBatchSender(key));
    const cleanSubject = String(subject ?? baseDraft.subject).trim().slice(0, 180);
    const cleanHeadline = String(headline ?? baseDraft.headline).trim().slice(0, 200);
    const cleanBody = String(body ?? baseDraft.body).trim().slice(0, 8000);
    const cleanCtaLabel = String(ctaLabel ?? baseDraft.ctaLabel).trim().slice(0, 80);
    const cleanCtaUrl = String(ctaUrl ?? baseDraft.ctaUrl).trim();
    const cleanPostal = String(postalAddress || DEFAULT_POSTAL_ADDRESS).trim().slice(0, 240);
    const cleanChannels = ['email', 'sms', 'both'].includes(channels) ? channels : 'both';
    const wantEmail = cleanChannels === 'email' || cleanChannels === 'both';
    const wantSms = cleanChannels === 'sms' || cleanChannels === 'both';
    const finalSmsBody = ensureSmsStopFooter(smsBody ?? baseDraft.smsBody);

    if (wantEmail && (!cleanSubject || !cleanHeadline || !cleanBody)) {
        throw new Error('Subject, headline, and body are required for email campaigns');
    }
    if (wantEmail && !cleanPostal) {
        throw new Error('A physical postal address is required by CAN-SPAM');
    }
    if (!isAllowedSmarterPokerUrl(cleanCtaUrl)) {
        throw new Error('CTA URL must be an https://smarter.poker link');
    }
    if (wantSms && !finalSmsBody) {
        throw new Error('SMS message text is required when SMS is enabled');
    }

    const apiKey = resendApiKey();
    const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const isWelcomeBackOffer = isWelcomeBackCtaUrl(cleanCtaUrl);
    const buildSignedRecipientUrl = (recipientUserId = '') =>
        isWelcomeBackOffer
            ? buildWelcomeBackOfferUrl(cleanCtaUrl, { userId: recipientUserId, siteUrl })
            : buildPromoSignupUrl(cleanCtaUrl, { siteUrl });
    const signedCtaUrl = buildSignedRecipientUrl('');
    const emailConfigured = Boolean(apiKey);
    const smsConfigured = Boolean(
        (process.env.TWILIO_ACCOUNT_SID || '').trim() &&
            (process.env.TWILIO_AUTH_TOKEN || '').trim() &&
            (process.env.TWILIO_PHONE_NUMBER || '').trim()
    );

    // Single-recipient test send (does not message the full audience)
    if (testOnly) {
        const targetEmail = wantEmail && testEmail ? normalizeExplicitTestEmail(testEmail) : null;
        const targetPhone = wantSms && testPhone ? sendablePhone(testPhone) : null;
        if (!targetEmail && !targetPhone) {
            throw new Error('Enter a valid test email or US mobile phone number for the selected channel');
        }
        const testOutcome = { emailSent: false, smsSent: false, targetEmail, targetPhone, errors: [] };

        if (targetEmail) {
            if (!emailConfigured) throw new Error('Resend API key is not configured');
            const unsubToken = makeUnsubscribeToken(targetEmail);
            const unsubscribeUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
            const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
            const rendered = renderPromoEmail({
                subject: `[TEST] ${cleanSubject}`,
                headline: cleanHeadline,
                body: cleanBody,
                ctaLabel: cleanCtaLabel,
                ctaUrl: signedCtaUrl,
                postalAddress: cleanPostal,
                siteUrl,
                unsubscribeUrl,
                preferencesUrl,
            });
            if (resendFactory) {
                const resend = effectiveResendFactory(apiKey);
                const batchRes = await sendResendBatch(resend, [
                    {
                        from,
                        to: [targetEmail],
                        subject: `[TEST] ${cleanSubject}`,
                        html: rendered.html,
                        text: rendered.text,
                        headers: {
                            'List-Unsubscribe': `<${unsubscribeUrl}>`,
                            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                        },
                    },
                ]);
                if (batchRes.sent > 0) testOutcome.emailSent = true;
                else testOutcome.errors.push(batchRes.error || 'Test email failed');
            } else {
                const singleRes = await sendSingleEmail({
                    to: [targetEmail],
                    subject: `[TEST] ${cleanSubject}`,
                    html: rendered.html,
                    text: rendered.text,
                    from: process.env.NEWS_DIGEST_FROM || DEFAULT_PROMO_FROM,
                    headers: {
                        'List-Unsubscribe': `<${unsubscribeUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    },
                });
                if (singleRes?.ok) testOutcome.emailSent = true;
                else testOutcome.errors.push(singleRes?.error || 'Test email failed');
            }
        }

        if (targetPhone) {
            if (!smsConfigured) throw new Error('Twilio SMS is not configured');
            const smsRes = await sendSms(`[TEST] ${finalSmsBody}`, { to: targetPhone, sb });
            if (smsRes?.ok) testOutcome.smsSent = true;
            else testOutcome.errors.push(smsRes?.error || 'Test SMS failed');
        }

        return {
            success: testOutcome.errors.length === 0,
            testOnly: true,
            from,
            ...testOutcome,
        };
    }

    const audience = await resolvePromoAudience(sb, { scope: cleanScope });
    const targetEmails = wantEmail ? audience.emails : [];
    const targetPhones = wantSms ? audience.phones : [];
    const totalRecipients = targetEmails.length + targetPhones.length;

    const sampleUnsubUrl = `${siteUrl}/api/news/subscribe?unsubscribe=preview`;
    const samplePrefsUrl = `${siteUrl}/hub/email-preferences?token=preview`;
    const sampleEmail = renderPromoEmail({
        subject: cleanSubject,
        headline: cleanHeadline,
        body: cleanBody,
        ctaLabel: cleanCtaLabel,
        ctaUrl: signedCtaUrl,
        postalAddress: cleanPostal,
        siteUrl,
        unsubscribeUrl: sampleUnsubUrl,
        preferencesUrl: samplePrefsUrl,
    });

    if (dryRun) {
        return {
            success: true,
            dryRun: true,
            channels: cleanChannels,
            scope: cleanScope,
            from,
            emailConfigured,
            smsConfigured,
            emailRecipients: targetEmails.length,
            smsRecipients: targetPhones.length,
            recipients: totalRecipients,
            breakdown: audience.breakdown,
            subject: cleanSubject,
            smsPreview: wantSms ? finalSmsBody : null,
            htmlPreview: wantEmail ? sampleEmail.html : null,
        };
    }

    if (wantEmail && targetEmails.length > 0 && !emailConfigured) {
        throw new Error('Email provider is not configured');
    }
    if (wantSms && targetPhones.length > 0 && !smsConfigured) {
        throw new Error('SMS provider (Twilio) is not configured');
    }
    if (totalRecipients === 0) {
        return {
            success: true,
            dryRun: false,
            sent: 0,
            failed: 0,
            emailSent: 0,
            smsSent: 0,
            recipients: 0,
            message: 'No eligible recipients matched the selected channels.',
        };
    }

    const auditLabel =
        cleanChannels === 'both'
            ? `[PROMO EMAIL+SMS] ${cleanSubject}`.slice(0, 200)
            : cleanChannels === 'sms'
                ? `[PROMO SMS] ${finalSmsBody}`.slice(0, 200)
                : `[PROMO EMAIL] ${cleanSubject}`.slice(0, 200);

    const { data: campaign, error: campaignErr } = await sb
        .from('newsletter_campaigns')
        .insert({
            subject: auditLabel,
            status: 'sending',
            lookback_days: 1,
            article_limit: 1,
            article_ids: [],
            recipient_count: totalRecipients,
            started_at: new Date().toISOString(),
            created_by: createdBy || null,
        })
        .select('id')
        .maybeSingle();

    if (campaignErr) throw campaignErr;
    if (!campaign?.id) throw new Error('Campaign audit row was not created');

    let emailSent = 0;
    let emailFailed = 0;
    let smsSent = 0;
    let smsFailed = 0;
    let smsSuppressed = 0;
    const errors = [];

    try {
        if (wantEmail && targetEmails.length > 0) {
            const resend = effectiveResendFactory(apiKey);
            for (let i = 0; i < targetEmails.length; i += EMAIL_BATCH_SIZE) {
                const chunk = targetEmails.slice(i, i + EMAIL_BATCH_SIZE);
                const messages = chunk.map((email) => {
                    const unsubToken = makeUnsubscribeToken(email);
                    const unsubscribeUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
                    const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
                    const recipientCtaUrl = buildSignedRecipientUrl(audience.emailToUserId?.get(email) || '');
                    const rendered = renderPromoEmail({
                        subject: cleanSubject,
                        headline: cleanHeadline,
                        body: cleanBody,
                        ctaLabel: cleanCtaLabel,
                        ctaUrl: recipientCtaUrl,
                        postalAddress: cleanPostal,
                        siteUrl,
                        unsubscribeUrl,
                        preferencesUrl,
                    });
                    return {
                        from,
                        to: [email],
                        subject: cleanSubject,
                        html: rendered.html,
                        text: rendered.text,
                        headers: {
                            'List-Unsubscribe': `<${unsubscribeUrl}>`,
                            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                        },
                        tags: [{ name: 'campaign_id', value: String(campaign.id) }],
                    };
                });
                const res = await sendResendBatch(resend, messages);
                emailSent += res.sent;
                emailFailed += res.failed;
                if (res.error && errors.length < 5) errors.push(`email: ${res.error}`);
            }
        }

        if (wantSms && targetPhones.length > 0) {
            // Deduplicate strictly once more and send in bounded waves of SMS_CONCURRENCY
            const uniquePhones = [...new Set(targetPhones)];
            for (let i = 0; i < uniquePhones.length; i += SMS_CONCURRENCY) {
                const wave = uniquePhones.slice(i, i + SMS_CONCURRENCY);
                const waveResults = await Promise.all(
                    wave.map((phone) => sendSms(finalSmsBody, { to: phone, sb }))
                );
                for (const r of waveResults) {
                    if (r?.ok) {
                        smsSent += 1;
                    } else if (r?.suppressed) {
                        smsSuppressed += 1;
                    } else {
                        smsFailed += 1;
                        if (r?.error && errors.length < 5) errors.push(`sms: ${r.error}`);
                    }
                }
            }
        }

        const totalSent = emailSent + smsSent;
        const totalFailed = emailFailed + smsFailed;
        const status = totalFailed === 0 ? 'sent' : totalSent > 0 ? 'partial' : 'failed';

        let existingErrSummary = null;
        try {
            const { data: latestRow } = await sb
                .from('newsletter_campaigns')
                .select('error_summary')
                .eq('id', campaign.id)
                .maybeSingle();
            existingErrSummary = latestRow?.error_summary || null;
        } catch {
            /* preserve send errors if readback unavailable */
        }

        const { error: finalizeErr } = await sb
            .from('newsletter_campaigns')
            .update({
                status,
                sent_count: totalSent,
                failed_count: totalFailed,
                error_summary: mergeFinalCampaignErrorSummary(existingErrSummary, errors),
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', campaign.id);

        if (finalizeErr) {
            return {
                success: false,
                campaignId: campaign.id,
                sent: totalSent,
                failed: totalFailed,
                emailSent,
                emailFailed,
                smsSent,
                smsFailed,
                smsSuppressed,
                error: 'Campaign sent but history row could not be finalized',
            };
        }

        return {
            success: totalFailed === 0,
            dryRun: false,
            campaignId: campaign.id,
            from,
            recipients: totalRecipients,
            sent: totalSent,
            failed: totalFailed,
            emailSent,
            emailFailed,
            smsSent,
            smsFailed,
            smsSuppressed,
            errors: errors.length ? errors : undefined,
        };
    } catch (err) {
        try {
            await sb
                .from('newsletter_campaigns')
                .update({
                    status: 'failed',
                    error_summary: String(err?.message || err).slice(0, 1000),
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', campaign.id);
        } catch (_ignore) { /* preserve primary error */ }
        throw err;
    }
}
