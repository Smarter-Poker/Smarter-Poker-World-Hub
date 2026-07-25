/**
 * apiRateLimit.js — Local override of @smarter-poker/commander-shared/lib/apiRateLimit
 *
 * Fixes two bugs in the shared package:
 * 1. getIdentifier: auth.slice(7, 39) captured JWT HEADER bytes (identical for ALL users).
 *    Fixed to use the last 32 chars of the token (signature segment — unique per user+session).
 * 2. X-Forwarded-For leftmost value is client-controlled (spoofable).
 *    Fixed to prefer x-real-ip (set by Vercel infra), then rightmost x-forwarded-for value.
 */

// Re-export the rateLimit function from the shared package but with our fixed applyRateLimit
import { LIMITS } from '@smarter-poker/commander-shared/lib/apiRateLimit';
export { LIMITS };

const store = new Map();

// Clean up expired entries every 5 min
if (typeof setInterval !== 'undefined') {
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store.entries()) {
            if (now > entry.reset) store.delete(key);
        }
    }, 5 * 60 * 1000);
    if (interval.unref) interval.unref();
}

function getIpIdentifier(req) {
    // Prefer x-real-ip (set by Vercel infra, not spoofable by client).
    // x-forwarded-for leftmost value is client-controlled and trivially spoofed.
    const realIp = req.headers?.['x-real-ip'];
    if (realIp) return 'ip:' + realIp.trim();

    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        const parts = forwarded.split(',');
        return 'ip:' + parts[parts.length - 1].trim();
    }

    return 'ip:' + (req.socket?.remoteAddress || 'unknown');
}

function getTokenIdentifier(req) {
    // Per-user bucketing: LAST 32 chars of the JWT (signature segment —
    // unique per user+session; the first chars are the same header for all
    // Supabase tokens). NOTE: this value is attacker-supplied and NOT
    // verified here, which is why the IP bucket below is always enforced too.
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ') && auth.length > 39) {
        return 'u:' + auth.slice(-32);
    }
    return null;
}

function bumpBucket(key, now, windowMs) {
    let entry = store.get(key);
    if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + windowMs };
    }
    entry.count++;
    store.set(key, entry);
    return entry;
}

// Headroom multiplier for the IP bucket when a Bearer token is present, so
// legitimate shared-IP users (offices, CGNAT) don't starve each other.
const IP_HEADROOM = 5;

export function rateLimit(req, { max = 60, windowMs = 60_000, scope = '' } = {}) {
    // [2026-07-25] DUAL-BUCKET enforcement. The old implementation keyed
    // SOLELY on the Bearer header when one was present — but that value is
    // attacker-supplied and unvalidated, so sending a random 40-char Bearer
    // per request minted a fresh bucket every time: unlimited signup spam on
    // unauthenticated endpoints, and TOTP brute-force via refresh-token
    // rotation on the MFA endpoints. The IP bucket is now ALWAYS enforced;
    // the token bucket is enforced additionally when present.
    const endpoint = (req.url?.split('?')[0] || '') + scope;
    const now = Date.now();

    const tokenId = getTokenIdentifier(req);
    const ipId = getIpIdentifier(req);

    const results = [];
    if (tokenId) {
        const entry = bumpBucket(`${tokenId}::${endpoint}`, now, windowMs);
        results.push({ max, remaining: Math.max(0, max - entry.count), ok: entry.count <= max, reset: entry.reset });
    }
    {
        const ipMax = tokenId ? max * IP_HEADROOM : max;
        const entry = bumpBucket(`${ipId}::${endpoint}`, now, windowMs);
        results.push({ max: ipMax, remaining: Math.max(0, ipMax - entry.count), ok: entry.count <= ipMax, reset: entry.reset });
    }

    // Report the failing bucket if any, else the tightest one.
    const rep = results.find((r) => !r.ok) ||
        results.reduce((a, b) => (a.remaining <= b.remaining ? a : b));

    return {
        ok: rep.ok,
        remaining: rep.remaining,
        reset: rep.reset,
        retryAfter: rep.ok ? undefined : Math.ceil((rep.reset - now) / 1000),
        headers: {
            'X-RateLimit-Limit': String(rep.max),
            'X-RateLimit-Remaining': String(rep.remaining),
            'X-RateLimit-Reset': String(Math.floor(rep.reset / 1000)),
        },
    };
}

export function applyRateLimit(req, res, opts = {}) {
    const result = rateLimit(req, opts);
    Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    if (!result.ok) {
        if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
        res.status(429).json({
            success: false,
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: result.retryAfter,
        });
        return false;
    }
    return true;
}
