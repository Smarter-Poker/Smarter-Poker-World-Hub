/**
 * GET|POST /api/cron/trivia-tournament-tick
 * ═══════════════════════════════════════════════════════════════════════════
 * Vercel cron entry point for the trivia tournament lifecycle.
 *
 * Runs one pass of runTournamentLifecycle(), which:
 *   - closes registration and generates the seeded bracket once start_time hits
 *   - cancels + refunds tournaments that never reached the minimum field size
 *   - decides matchups whose deadline has passed (forfeits, ties, byes)
 *   - opens the next round with the winners
 *   - finalises standings and pays the accumulated prize pool out, atomically
 *     and idempotently
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — the same convention used by
 * every other cron route in this repo. Vercel sends this header automatically
 * for declared crons.
 *
 * Cadence: every 15 minutes is plenty. Rounds are 24h, so the only latency this
 * adds is up to 15 minutes on round rollover and payout. Every step is guarded,
 * so a double-fire (retry, manual poke, overlapping invocation) is harmless.
 *
 * vercel.json entry (vercel.json is owned by the generation fixer — see the
 * cross-file request in the fixer report):
 *     { "path": "/api/cron/trivia-tournament-tick", "schedule": "0,15,30,45 * * * *" }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { runTournamentLifecycle, serviceClient } from '../trivia/tournament-lifecycle';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';

export default async function handler(req, res) {
    const startedAt = Date.now();
    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Cron auth via the shared gate: fail-closed when CRON_SECRET is unset
        // or too short, constant-time comparison, header-only (no ?secret=).
        // This route moves diamonds, so it must not carry a weaker private copy
        // of the check than the admin routes do.
        if (!requireAdminSecret(req, res, { label: 'trivia-tournament-tick' })) return;

        const out = await runTournamentLifecycle(serviceClient(), {});

        const durationMs = Date.now() - startedAt;
        const actions = {};
        for (const r of out.results || []) {
            const key = r?.action || 'unknown';
            actions[key] = (actions[key] || 0) + 1;
        }
        // Loud log for anything that moved money or failed.
        for (const r of out.results || []) {
            if (r?.action === 'completed' || r?.action === 'cancelled' || r?.action === 'error') {
                console.log('[trivia-tournament-tick]', JSON.stringify(r));
            }
        }

        return res.status(out.success ? 200 : 500).json({
            success: out.success,
            processed: out.processed || 0,
            actions,
            duration_ms: durationMs,
            results: out.results || []
        });
    } catch (e) {
        console.error('[trivia-tournament-tick] unexpected:', e);
        try { reportApiError(e, { route: '/api/cron/trivia-tournament-tick' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
