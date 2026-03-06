/**
 * 🛡️ ANTI-ABUSE UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 * Email normalization, hashing, and IP extraction for signup abuse detection.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';

/**
 * Normalize an email to detect aliases and dot variations.
 * Gmail, Googlemail, and Outlook ignore dots in the local part.
 * All providers' +alias suffixes are stripped.
 *
 * Examples:
 *   "User.Name+promo@gmail.com"   → "username@gmail.com"
 *   "my.email+test@outlook.com"   → "myemail@outlook.com"
 *   "user@Googlemail.com"         → "user@gmail.com"
 *   "normal@yahoo.com"            → "normal@yahoo.com" (dots kept)
 */
export function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';
    const lower = email.toLowerCase().trim();
    const [localPart, domain] = lower.split('@');
    if (!localPart || !domain) return lower;

    // Strip +alias suffix from ALL providers
    const stripped = localPart.split('+')[0];

    // Normalize domain aliases
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;

    // Strip dots for providers that ignore them
    const dotIgnoringDomains = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com'];
    const finalLocal = dotIgnoringDomains.includes(normalizedDomain)
        ? stripped.replace(/\./g, '')
        : stripped;

    return `${finalLocal}@${normalizedDomain}`;
}

/**
 * SHA-256 hash of the normalized email.
 * Stored in signup_abuse_log so that even if we delete the raw email,
 * we can still match future signups.
 */
export function hashEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extract client IP from request headers.
 * Vercel sets x-forwarded-for; fallback to x-real-ip and socket.
 */
export function extractClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        // x-forwarded-for can be comma-separated; first is the client
        return forwarded.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
