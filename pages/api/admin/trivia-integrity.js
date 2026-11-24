/**
 * GET /api/admin/trivia-integrity
 *
 * Operator-only anti-cheat integrity review queue.
 * Protected by requireTriviaOperator (exact same operator RBAC as
 * /api/admin/trivia-operations) and backed by
 * public.trivia_integrity_review_queue_v1. Never leaks answer keys.
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { normalizeOperatorContext } from '../../../src/lib/trivia/operationsSnapshot.mjs';

let cachedClient = null;
function serviceClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    if (!cachedClient) cachedClient = createClient(url, key, { auth: { persistSession: false } });
    return cachedClient;
}

async function requireTriviaOperator(req, res, client) {
    if (!req.headers?.authorization?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'authorization_required' });
        return null;
    }
    const { user, error } = await getServerUserWithFallback(req, client);
    if (error || !user?.id) {
        res.status(401).json({ success: false, error: 'invalid_session' });
        return null;
    }
    const { data, error: contextError } = await client.rpc('trivia_operator_context_v1', {
        p_operator_id: user.id,
    });
    if (contextError) {
        console.warn('[trivia-integrity] operator context unavailable:', contextError.code || 'read_failed');
        res.status(503).json({ success: false, error: 'operator_context_unavailable' });
        return null;
    }
    const context = normalizeOperatorContext(data);
    if (!context.allowed) {
        res.status(403).json({ success: false, error: 'trivia_operator_required' });
        return null;
    }
    return { user, context };
}

function parseLimit(raw) {
    const parsed = Number.parseInt(String(raw ?? '50'), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 50;
    return Math.min(200, parsed);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const client = serviceClient();
    if (!client) return res.status(503).json({ success: false, error: 'server_misconfigured' });

    const operator = await requireTriviaOperator(req, res, client);
    if (!operator) return;

    try {
        const limit = parseLimit(req.query?.limit);
        const { data, error } = await client.rpc('trivia_integrity_review_queue_v1', {
            p_limit: limit,
        });
        if (error || !data || data.success !== true) {
            console.warn('[trivia-integrity] queue read failed:', error?.code || error?.message || 'unknown');
            return res.status(503).json({ success: false, error: 'integrity_queue_unavailable' });
        }

        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            operator: {
                id: operator.user.id,
                roles: operator.context.roles,
            },
            limit: data.limit ?? limit,
            summary: data.summary || { total_signals: 0, flagged_signals: 0, high_risk_signals: 0 },
            flaggedSessions: Array.isArray(data.flagged_sessions) ? data.flagged_sessions : [],
            userAggregates: Array.isArray(data.user_aggregates) ? data.user_aggregates : [],
        });
    } catch (err) {
        console.warn('[trivia-integrity] request failed:', err?.message || err);
        try { reportApiError(err, { route: '/api/admin/trivia-integrity' }); } catch (_) { /* best effort */ }
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'integrity_queue_request_failed' });
        }
        return undefined;
    }
}
