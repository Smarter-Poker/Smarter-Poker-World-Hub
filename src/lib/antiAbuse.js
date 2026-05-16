/**
 * 🛡️ ANTI-ABUSE UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 * Email normalization, hashing, IP extraction, disposable email detection,
 * and device fingerprint storage for signup abuse prevention.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// DISPOSABLE EMAIL DOMAIN BLOCKLIST
// Covers 60+ throwaway email providers. Users with these domains
// will NOT receive the Welcome Package (500💎 + VIP).
// ═══════════════════════════════════════════════════════════════
const DISPOSABLE_DOMAINS = new Set([
    'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'guerrillamailblock.com', 'grr.la', 'sharklasers.com',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io',
    'throwaway.email', 'throwaway.com',
    'mailinator.com', 'mailinater.com',
    'yopmail.com', 'yopmail.fr', 'yopmail.net',
    'dispostable.com', 'maildrop.cc',
    'guerrillamail.de', 'guerrillamail.biz',
    'trashmail.com', 'trashmail.net', 'trashmail.me',
    'fakeinbox.com', 'sharklasers.com',
    'mailnesia.com', 'mailcatch.com',
    'tempail.com', 'tempr.email',
    'discard.email', 'discardmail.com', 'discardmail.de',
    'emailondeck.com', 'getnada.com',
    'mohmal.com', 'mailnull.com',
    '10minutemail.com', '10minutemail.net',
    'minutemail.com',
    'harakirimail.com', 'jetable.org',
    'spamgourmet.com', 'mytrashmail.com',
    'bugmenot.com', 'mailexpire.com',
    'safetymail.info', 'filzmail.com',
    'trashymail.com', 'trashymail.net',
    'mailforspam.com', 'tempomail.fr',
    'getairmail.com', 'meltmail.com',
    'spamfree24.org', 'binkmail.com',
    'spamavert.com', 'incognitomail.org',
    'mailnator.com', 'anonbox.net',
    'anonymbox.com', 'greensloth.com',
]);

/**
 * Check if an email uses a disposable/throwaway domain.
 */
function isDisposableEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const domain = email.toLowerCase().trim().split('@')[1];
    if (!domain) return false;
    return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Normalize an email to detect aliases and dot variations.
 */
function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';
    const lower = email.toLowerCase().trim();
    const [localPart, domain] = lower.split('@');
    if (!localPart || !domain) return lower;

    const stripped = localPart.split('+')[0];
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;

    const dotIgnoringDomains = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com'];
    const finalLocal = dotIgnoringDomains.includes(normalizedDomain)
        ? stripped.replace(/\./g, '')
        : stripped;

    return `${finalLocal}@${normalizedDomain}`;
}

/**
 * SHA-256 hash of the normalized email.
 */
function hashEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extract client IP from request headers.
 */
function extractClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Log an admin action to the admin_audit_log table.
 *
 * Phase 6.1.8 — now routes through fn_log_admin_action (SECURITY DEFINER)
 * so callers don't need INSERT permission on admin_audit_log and the server
 * can capture actor_role, user_agent, and request_id from the request headers.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {object} opts - {
 *   admin_user_id, action, target_type, target_id, details,
 *   before, after, ip_address, user_agent, request_id, req
 * }
 *
 * If `req` is provided we derive ip_address / user_agent / request_id from
 * headers when the caller didn't pass them explicitly.
 */
async function logAdminAction(supabase, opts) {
    try {
        const req = opts.req;
        const ip =
            opts.ip_address ||
            (req ? extractClientIP(req) : null);
        const ua =
            opts.user_agent ||
            (req ? req.headers?.['user-agent'] || null : null);
        const rid =
            opts.request_id ||
            (req ? (req.headers?.['x-vercel-id'] || req.headers?.['x-request-id'] || null) : null);
        const targetId = opts.target_id == null ? null : String(opts.target_id);

        const { error } = await supabase.rpc('fn_log_admin_action', {
            p_admin_user_id: opts.admin_user_id || null,
            p_action: opts.action,
            p_target_type: opts.target_type || null,
            p_target_id: targetId,
            p_details: opts.details || {},
            p_before_state: opts.before || null,
            p_after_state: opts.after || null,
            p_ip_address: ip,
            p_user_agent: ua,
            p_request_id: rid,
        });
        if (error) {
            // Fall back to direct insert (service-role bypasses RLS) so logging
            // never silently drops even if the RPC is ever unavailable.
            const { error: err_admin_audit_log_l4r0i } = await supabase.from('admin_audit_log').insert({
                admin_user_id: opts.admin_user_id || null,
                action: opts.action,
                target_type: opts.target_type || null,
                target_id: targetId,
                details: opts.details || {},
                ip_address: ip,
                user_agent: ua,
                before_state: opts.before || null,
                after_state: opts.after || null,
                request_id: rid,
                created_at: new Date().toISOString(),
            });
            if (err_admin_audit_log_l4r0i) console.warn('[Supabase] Silent mutation failed in admin_audit_log:', err_admin_audit_log_l4r0i.message);
        }
    } catch (err) {
        console.warn('[AUDIT] Failed to log admin action:', err.message);
    }
}

module.exports = {
    normalizeEmail,
    hashEmail,
    extractClientIP,
    isDisposableEmail,
    logAdminAction,
    DISPOSABLE_DOMAINS,
};

