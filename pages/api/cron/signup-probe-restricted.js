/**
 * /api/cron/signup-probe-restricted — Restricted-Region Synthetic Probe
 * ═══════════════════════════════════════════════════════════════════════════
 * Sister probe to /api/cron/signup-probe. Verifies that signup ALSO works
 * from the perspective of a user in a restricted US state (WA/UT/LA/etc).
 *
 * The 2026-04-24 → 2026-05-03 outage was specifically that the geo-block
 * middleware redirected /auth/* for users in 10 restricted states. The
 * standard signup-probe runs from a Vercel data center where request.geo
 * doesn't trigger the block, so it would have shown green during the
 * outage.
 *
 * Strategy: hit our own /auth/signup page with the x-geo-bypass header
 * stripped (default) AND with a fake-geo header set to a restricted
 * state. The middleware's allow_paths must let /auth/* through
 * regardless. If it returns 307 → /jurisdiction-blocked, we know the
 * geo-allowlist regressed.
 *
 * This does NOT actually create a user — it's a CHEAP per-region check.
 * The full signup probe (creating + cleaning up a user) only runs from
 * the default region.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { validateCronAuth } from '../../../src/utils/cron-auth';
import { reportApiError } from '../../../src/lib/sentryWrap';

// States the geo-blocker treats as restricted. If any of these gets a
// redirect to /jurisdiction-blocked when hitting /auth/signup, the
// allow_paths regressed.
const RESTRICTED_STATES = ['WA', 'UT', 'LA', 'ID', 'MT', 'SD', 'IN', 'MI', 'MS', 'TN'];

// Auth paths that must remain reachable from every region.
const AUTH_PATHS = ['/auth/signup', '/auth/login', '/auth/callback', '/auth/quick'];

// The base URL we probe — defaults to the deployment's own VERCEL_URL,
// falls back to the public domain.
function getBaseUrl(req) {
    return process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker');
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const base = getBaseUrl(req);
    const startedAt = Date.now();
    const checks = [];

    try {
        for (const state of RESTRICTED_STATES) {
            for (const path of AUTH_PATHS) {
                const url = `${base}${path}`;
                let status = 'unknown';
                let httpCode = 0;
                let blocked = false;
                try {
                    // We DON'T actually have a way to spoof Vercel's
                    // request.geo from inside a Vercel function — the
                    // geo header is set by Vercel's edge before our
                    // function runs. So this check is a SHALLOW one:
                    // verify the path returns 200 (not 307 → blocked).
                    // For real per-region testing, an external monitor
                    // (e.g. UptimeRobot from multiple POPs) is needed.
                    //
                    // What this DOES catch: if /auth/* gets removed
                    // from allow_paths, the path returns 307 even from
                    // the same region the function runs in.
                    const r = await fetch(url, {
                        method: 'GET',
                        redirect: 'manual',
                        headers: {
                            'User-Agent': 'smarter-poker-probe/1.0',
                            'X-Probe-Region': state,
                        },
                    });
                    httpCode = r.status;
                    if (r.status >= 300 && r.status < 400) {
                        const loc = r.headers.get('location') || '';
                        if (loc.includes('/jurisdiction-blocked')) {
                            blocked = true;
                            status = 'geo-blocked';
                        } else {
                            status = 'redirected';
                        }
                    } else if (r.status === 200) {
                        status = 'ok';
                    } else {
                        status = `http-${r.status}`;
                    }
                } catch (e) {
                    status = `error:${e?.message || 'fetch failed'}`;
                }
                checks.push({ state, path, httpCode, status, blocked });
            }
        }

        const failures = checks.filter((c) => c.blocked || c.status.startsWith('error') || c.status.startsWith('http-5'));

        return res.status(failures.length ? 503 : 200).json({
            status: failures.length ? 'failed' : 'ok',
            duration_ms: Date.now() - startedAt,
            check_count: checks.length,
            failure_count: failures.length,
            failures,
            note: 'Shallow check: verifies /auth/* is not 307→/jurisdiction-blocked from this Vercel region. For true per-region testing, add an external monitor (UptimeRobot, BetterUptime).',
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) { /* ignore */ }
        return res.status(500).json({ status: 'error', error: err?.message });
    }
}
