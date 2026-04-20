/**
 * Club Arena service health — Phase 5.1.4
 * GET /api/club-arena/health
 *
 * Public endpoint (no auth) — scraped by Prometheus blackbox_exporter via
 * infra/monitoring/prometheus.yml and also used by external uptime pingers.
 *
 * Returns a simple {status, version, uptime} — the admin-grade health probe
 * with db/realtime/engineReachable lives at /api/admin/health (auth-gated).
 *
 * Keeping this public and cheap avoids enumeration concerns — there's
 * nothing here that isn't already visible to anyone watching DNS for
 * club.smarter.poker -> smarter.poker/hub/club-arena.
 */

import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    const start = Date.now();
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ status: 'error', error: 'GET only' });
        }

        // Cache briefly at the edge so a burst of probes doesn't hit the
        // Vercel function layer. `stale-while-revalidate` lets us serve
        // stale while refreshing in the background.
        res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');

        const payload = {
            status: 'ok',
            service: 'club-arena',
            version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || 'local',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            responseMs: Date.now() - start,
        };

        return res.status(200).json(payload);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        if (!res.headersSent) {
            return res.status(500).json({ status: 'error', error: err?.message || 'health check failed' });
        }
    }
}
