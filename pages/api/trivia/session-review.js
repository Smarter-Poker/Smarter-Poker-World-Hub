import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { resolveTrainingSpotForCategory } from '../../../src/lib/trivia/socialGrowthHelpers.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedServiceClient = null;
function serviceClient() {
    if (!cachedServiceClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('session review server configuration unavailable');
        cachedServiceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return cachedServiceClient;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Allow', 'GET');

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

    let client;
    try {
        client = serviceClient();
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/session-review', operation: 'service_client' }); } catch (_) {}
        return res.status(503).json({ success: false, error: 'server_configuration_unavailable' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, client);
    if (authError || !user?.id) {
        return res.status(401).json({ success: false, error: 'authentication_required' });
    }

    const sessionId = typeof req.query?.sessionId === 'string' ? req.query.sessionId.trim() : '';
    if (!UUID_RE.test(sessionId)) {
        return res.status(400).json({ success: false, error: 'invalid_session_id' });
    }

    try {
        const { data, error } = await client.rpc('trivia_post_settlement_review_v1', {
            p_user_id: user.id,
            p_session_id: sessionId,
        });
        if (error) {
            try { reportApiError(error, { route: 'trivia/session-review', userId: user.id, sessionId }); } catch (_) {}
            return res.status(500).json({ success: false, error: 'session_review_failed' });
        }
        if (!data || data.success !== true) {
            const code = data?.error || 'session_review_failed';
            const status = code === 'review_not_available_before_settlement'
                ? 409
                : code === 'not_your_session'
                    ? 403
                    : code === 'session_not_found'
                        ? 404
                        : 400;
            return res.status(status).json({ success: false, error: code });
        }

        const items = Array.isArray(data.items)
            ? data.items.map((item) => ({
                ...item,
                trainingSpot: resolveTrainingSpotForCategory(item.category),
            }))
            : [];

        return res.status(200).json({
            ...data,
            items,
        });
    } catch (error) {
        try { reportApiError(error, { route: 'trivia/session-review', userId: user.id, sessionId }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'internal_error' });
    }
}
