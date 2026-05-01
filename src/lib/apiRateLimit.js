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

function getIdentifier(req) {
    // Per-user rate limiting: use the LAST 32 chars of the JWT (signature segment).
    // The FIRST chars are always the same standard header for all Supabase tokens.
    const auth = req.headers?.authorization;
    if (auth?.startsWith('Bearer ') && auth.length > 39) {
        return 'u:' + auth.slice(-32);
    }

    // Fallback to IP — prefer x-real-ip (set by Vercel infra, not spoofable by client).
    // x-forwarded-for leftmost value is client-controlled and trivially spoofed.
    const realIp = req.headers?.['x-real-ip'];
    if (realIp) return 'ip:' + realIp.trim();

    // Last resort: rightmost x-forwarded-for value (last trusted hop added by infrastructure)
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        const parts = forwarded.split(',');
        return 'ip:' + parts[parts.length - 1].trim();
    }

    return 'ip:' + (req.socket?.remoteAddress || 'unknown');
}

export function rateLimit(req, { max = 60, windowMs = 60_000, scope = '' } = {}) {
    const id = getIdentifier(req);
    const endpoint = (req.url?.split('?')[0] || '') + scope;
    const key = `${id}::${endpoint}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + windowMs };
    }

    entry.count++;
    store.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    const ok = entry.count <= max;

    return {
        ok,
        remaining,
        reset: entry.reset,
        retryAfter: ok ? undefined : Math.ceil((entry.reset - now) / 1000),
        headers: {
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(Math.floor(entry.reset / 1000)),
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
