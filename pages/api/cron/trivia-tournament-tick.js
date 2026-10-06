/**
 * GET|POST /api/cron/trivia-tournament-tick
 *
 * Authenticated tombstone for the legacy tournament lifecycle worker.
 *
 * Phase 6 replaced this worker with the fenced nightly engine owned by the
 * OpenClaw workers route. Keeping the old implementation callable would give
 * an operator two authorities over the same tournament family as soon as the
 * public release flag is enabled. A stale caller is authenticated, recorded in
 * provider logs with a structured outcome, and refused before any database
 * client is created.
 */

import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';

const ROUTE = '/api/cron/trivia-tournament-tick';

export default function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }

    // Keep the tombstone private. Public callers must not be able to use a
    // retired route as a deployment-or-flag oracle.
    if (!requireAdminSecret(req, res, { label: 'trivia-tournament-tick-retired' })) return;

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    console.warn('[trivia-retired-route]', JSON.stringify({
        event: 'retired_route_invoked',
        route: ROUTE,
        method: req.method,
        replacement: '/cron/trivia-nightly-tournament',
        occurred_at: new Date().toISOString(),
    }));

    return res.status(410).json({
        success: false,
        error: 'legacy_tournament_tick_retired',
        replacement: 'fenced_nightly_tournament_engine',
    });
}
