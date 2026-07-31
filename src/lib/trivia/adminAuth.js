/**
 * Shared admin/cron authentication for trivia API routes.
 * ═══════════════════════════════════════════════════════════════════════════
 * Replaces the fail-open pattern that appeared in every admin route:
 *
 *   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }
 *
 * With CRON_SECRET unset that template renders "Bearer undefined", so an
 * attacker sending that literal header authenticated. The query-param variant
 * was worse: `if (secret !== process.env.CRON_SECRET)` compares
 * undefined !== undefined => false, so a request with NO credentials at all
 * passed. These endpoints spend paid Grok tokens and write to
 * trivia_questions with the service-role key.
 *
 * Rules enforced here:
 *   - a missing/blank secret in the environment is a 500, never an open door
 *   - the credential is header-only (query strings leak into access logs)
 *   - comparison is constant-time and length-safe
 */

import crypto from 'crypto';

/** Constant-time string comparison that tolerates unequal lengths. */
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
        // Still burn a comparison so the failure timing does not leak length.
        crypto.timingSafeEqual(ab, ab);
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

/**
 * Require a valid admin/cron credential.
 *
 * Accepts `Authorization: Bearer <CRON_SECRET>` or, when ADMIN_ROUTE_SECRET is
 * configured, `x-admin-secret: <ADMIN_ROUTE_SECRET>`.
 *
 * Sends the error response itself and returns false when auth fails, so the
 * caller can simply `if (!requireAdminSecret(req, res)) return;`.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} [opts]
 * @param {string} [opts.label] - route name used in log lines
 * @returns {boolean} true when the caller is authorised
 */
export function requireAdminSecret(req, res, opts = {}) {
    const label = opts.label || 'admin';
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_ROUTE_SECRET;

    const hasCron = typeof cronSecret === 'string' && cronSecret.length >= 8;
    const hasAdmin = typeof adminSecret === 'string' && adminSecret.length >= 8;

    if (!hasCron && !hasAdmin) {
        console.warn(`[${label}] CRON_SECRET/ADMIN_ROUTE_SECRET not configured — refusing all requests`);
        res.status(500).json({ error: 'Server misconfigured' });
        return false;
    }

    const authHeader = req.headers?.authorization;
    if (hasCron && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        if (safeEqual(authHeader.slice(7).trim(), cronSecret)) return true;
    }

    const headerSecret = req.headers?.['x-admin-secret'];
    if (hasAdmin && typeof headerSecret === 'string' && safeEqual(headerSecret, adminSecret)) return true;

    // Note for operators migrating old callers: the ?secret= query parameter is
    // deliberately NOT accepted — it leaks the credential into Vercel and any
    // intermediary access logs.
    res.status(401).json({ error: 'Unauthorized' });
    return false;
}

export default requireAdminSecret;
