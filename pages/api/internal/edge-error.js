/**
 * POST /api/internal/edge-error - the edge runtime's route to Sentry
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-04, docs/SENTRY-FREE-TIER-POLICY.md section 3: sentry.edge.config.js
 * is gone, so middleware.ts cannot report a throw itself. Its geo-block,
 * admin-guard and JWT-gate try/catch blocks POST here instead (see
 * reportEdgeError in middleware.ts). This runs in Node, where
 * reportApiError() is allowlisted for this path and the daily budget applies.
 *
 * Contract:
 *   - Refuses anything without `x-edge-error-secret` == ADMIN_ROUTE_SECRET,
 *     so the public cannot spend the Sentry budget by hitting it.
 *   - Rate limited on top of that.
 *   - Never fails loudly: every path after auth returns 200. A reporter that
 *     500s just makes a second error out of the first.
 *   - Flushes before returning so the lambda does not freeze mid-send.
 */

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError, flushSentry } from '../../../src/lib/sentryWrap';

const STAGES = new Set(['geo-block', 'admin-guard', 'jwt-gate']);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = process.env.ADMIN_ROUTE_SECRET;
    const given = req.headers['x-edge-error-secret'];
    if (!secret || typeof given !== 'string' || given !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!applyRateLimit(req, res, { max: 30, windowMs: 60_000, scope: 'edge-error' })) {
        return undefined;
    }

    try {
        const body = typeof req.body === 'object' && req.body ? req.body : {};
        const stage = STAGES.has(body.stage) ? body.stage : 'unknown';
        const message = String(body.message || 'middleware threw').slice(0, 500);
        const path = String(body.path || '').slice(0, 300);
        const method = String(body.method || '').slice(0, 10);

        const err = new Error(`[middleware:${stage}] ${message}`);
        err.name = 'EdgeMiddlewareError';
        if (typeof body.stack === 'string' && body.stack) {
            err.stack = String(body.stack).slice(0, 2000);
        }

        await reportApiError(err, req, {
            tags: { edge_stage: stage, edge_path: path || 'unknown', edge_method: method || 'unknown' },
            context: { edge_path: path, edge_method: method },
        });
        await flushSentry(1500);
    } catch (e) {
        console.warn('[edge-error] could not report:', e?.message || e);
    }

    return res.status(200).json({ ok: true });
}
