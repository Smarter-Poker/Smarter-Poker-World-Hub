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
import { withCronHealth } from '../../../src/lib/cronHealth';

// States the geo-blocker treats as restricted. If any of these gets a
// redirect to /jurisdiction-blocked when hitting /auth/signup, the
// allow_paths regressed.
const RESTRICTED_STATES = ['WA', 'UT', 'LA', 'ID', 'MT', 'SD', 'IN', 'MI', 'MS', 'TN'];

// Auth paths that must remain reachable from every region.
const AUTH_PATHS = ['/auth/signup', '/auth/login', '/auth/callback', '/auth/quick'];

// [2026-07-25] Probe the PUBLIC domain, not VERCEL_URL. The deployment URL
// misses production-domain-level failures (DNS, alias, CDN) and can sit
// behind deployment protection (401), poisoning results either way. The
// public domain is what actual users hit.
function getBaseUrl(req) {
    return (process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker').trim();
}

export const config = { maxDuration: 30 };

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const base = getBaseUrl(req);
    const startedAt = Date.now();
    const checks = [];

    try {
        // [2026-07-25] The old version looped 10 states x 4 paths = 40
        // byte-identical fetches: X-Probe-Region does nothing (Vercel's edge
        // sets request.geo before our function runs — see comment below), so
        // the state dimension tested nothing while implying restricted-state
        // coverage. One pass over the 4 paths gives identical signal.
        {
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
                        },
                    });
                    httpCode = r.status;
                    if (r.status >= 300 && r.status < 400) {
                        const loc = r.headers.get('location') || '';
                        if (loc.includes('/jurisdiction-blocked')) {
                            blocked = true;
                            status = 'geo-blocked';
                        } else {
                            // A redirect anywhere other than the same path
                            // (e.g. trailing-slash normalization) means auth
                            // pages are being detoured — that's a failure.
                            let samePath = false;
                            try {
                                const locPath = new URL(loc, base).pathname.replace(/\/$/, '');
                                samePath = locPath === path.replace(/\/$/, '');
                            } catch (_) { /* unparseable location -> foreign */ }
                            status = samePath ? 'ok' : 'redirected-foreign';
                        }
                    } else if (r.status === 200) {
                        status = 'ok';
                    } else {
                        status = `http-${r.status}`;
                    }
                } catch (e) {
                    status = `error:${e?.message || 'fetch failed'}`;
                }
                checks.push({ path, httpCode, status, blocked });
            }
        }

        // [2026-07-25] 4xx now counts as FAILURE. The old filter only caught
        // 5xx, so "signup page deleted → 404 on every check" reported
        // status:'ok' — the exact 2026-05-02 incident class this probe
        // family exists to catch. Foreign redirects likewise.
        const failures = checks.filter((c) =>
            c.blocked ||
            c.status.startsWith('error') ||
            c.status === 'redirected-foreign' ||
            (c.httpCode >= 400)
        );

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

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('signup-probe-restricted', handler);
