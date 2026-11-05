/**
 * One place that decides which Resend account every email goes through
 * (Dan, 2026-11-05).
 *
 * RESEND_API_KEY belongs to the original Free-plan Resend account that owns
 * the root smarter.poker sending domain. Nobody can log into that account and
 * it stops at 100 emails a day, so digest, alert, welcome, support and news
 * mail could silently stop mid-day. The Pro account (support@smarter.poker)
 * has no daily cap and sends from mail.smarter.poker, which is verified there
 * and aligned with the smarter.poker DMARC policy.
 *
 * When RESEND_BULK_API_KEY (the Pro key) is set, every sender uses it and any
 * @smarter.poker sender address is moved to @mail.smarter.poker, keeping the
 * display name and the mailbox part (support@, noreply@, news@, alerts@).
 * Recipients and Reply-To addresses are never changed. With no Pro key the
 * old behaviour stays exactly as it was.
 */

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
export const PRO_SENDING_DOMAIN = 'mail.smarter.poker';
const ROOT_DOMAIN = 'smarter.poker';

export function usingProAccount(env = process.env) {
    return !!trim(env.RESEND_BULK_API_KEY);
}

/** The key every Resend call should use. Empty string when none is set. */
export function resendApiKey(env = process.env) {
    return trim(env.RESEND_BULK_API_KEY) || trim(env.RESEND_API_KEY);
}

/** The domain the active account sends from (what a deliverability check should look for). */
export function resendSendingDomain(env = process.env) {
    return usingProAccount(env) ? PRO_SENDING_DOMAIN : ROOT_DOMAIN;
}

/**
 * Rewrite a From value ("Name <a@smarter.poker>" or "a@smarter.poker") onto
 * the Pro sending domain when the Pro key is active. Other domains, and
 * addresses already on a smarter.poker subdomain, are left alone.
 */
export function resendFrom(from, env = process.env) {
    const value = String(from || '');
    if (!usingProAccount(env)) return value;
    return value.replace(/([A-Za-z0-9._%+-]+)@smarter\.poker(?![A-Za-z0-9.-])/gi, `$1@${PRO_SENDING_DOMAIN}`);
}
