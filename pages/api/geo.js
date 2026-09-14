/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHERE IS THIS PLAYER - GET /api/geo
 * ═══════════════════════════════════════════════════════════════════════════
 * Returns { country } as the edge saw the request: Vercel stamps
 * x-vercel-ip-country (ISO 3166-1 alpha-2) on every request that reaches a
 * function. Nothing else. No IP, no city, no region, no session.
 *
 * ── WHO ASKS ────────────────────────────────────────────────────────────────
 * The two ad clients. Both the Hub (src/lib/hubAds.js) and Club Arena
 * (AdService.resolve, served through the /hub/club-arena rewrite so it is
 * same-origin here) fetch this once per page load and pass the answer to
 * `fn_resolve_ads` as `p_country`. A sponsor flight with a country list is
 * served only to a player known to be inside it; a player whose country is
 * unknown never sees a country-limited advert. House and club flights carry
 * no list and are untouched.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 * A hint, never a credential. A player who lies about where they are sees an
 * advert they were not meant to, and nothing on this platform is unlocked by
 * it. It is therefore public, unauthenticated, and answers "unknown" (null)
 * rather than guessing when the header is missing, as it is in local dev.
 * Never widen this route to return anything a person could be located by.
 *
 * Cached by nobody: `no-store`, because the answer is per request and a CDN
 * that held it would hand one player's country to the next.
 */

import { applyRateLimit, LIMITS } from '../../src/lib/apiRateLimit';

export default function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    const raw = req.headers['x-vercel-ip-country'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    const code = typeof header === 'string' ? header.trim().toUpperCase() : '';
    const country = /^[A-Z]{2}$/.test(code) ? code : null;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ country });
}
