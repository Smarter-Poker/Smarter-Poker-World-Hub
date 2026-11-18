/**
 * Verify a Resend webhook. Resend signs with Svix:
 *   headers  svix-id, svix-timestamp, svix-signature ("v1,<base64> v1,<base64>")
 *   secret   "whsec_<base64 key>"
 *   signed   `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256, base64
 * A timestamp more than five minutes from now is refused (replay window).
 * Implemented here rather than pulling in the svix package for one function.
 */
import crypto from 'node:crypto';

export const TOLERANCE_SECONDS = 300;

export function signSvix(secret, id, timestamp, rawBody) {
    const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
    return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
}

export function verifySvix(secret, headers, rawBody, now = Date.now()) {
    if (!secret || typeof rawBody !== 'string') return { ok: false, reason: 'missing_secret_or_body' };
    const h = (name) => {
        const v = headers?.[name] ?? headers?.[name.toLowerCase()];
        return Array.isArray(v) ? v[0] : v;
    };
    const id = h('svix-id');
    const ts = h('svix-timestamp');
    const sigHeader = h('svix-signature');
    if (!id || !ts || !sigHeader) return { ok: false, reason: 'missing_headers' };
    if (!/^\d+$/.test(String(ts))) return { ok: false, reason: 'bad_timestamp' };
    if (Math.abs(now / 1000 - Number(ts)) > TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };
    const expected = Buffer.from(signSvix(secret, id, ts, rawBody));
    const match = String(sigHeader).split(' ').some((part) => {
        const [version, sig] = part.split(',');
        if (version !== 'v1' || !sig) return false;
        const got = Buffer.from(sig);
        return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    });
    return match ? { ok: true, id } : { ok: false, reason: 'bad_signature' };
}
