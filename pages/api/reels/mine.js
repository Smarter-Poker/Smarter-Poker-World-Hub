/**
 * GET /api/reels/mine
 *
 * Authenticated creator collection. Identity always comes from the verified
 * bearer token; no caller-supplied user id is accepted.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    readOwnedPokerReels,
    ReelsFeedInputError,
} from '../../../src/lib/server/reelsFeed';

let authClient = null;

function getAuthClient() {
    if (authClient) return authClient;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Reels authentication configuration is unavailable');
    authClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return authClient;
}

function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function setPrivateHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
}

export default async function handler(req, res) {
    setPrivateHeaders(res);
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const { user, error: authError } = await getServerUserWithFallback(req, getAuthClient());
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const result = await readOwnedPokerReels({
            userId: user.id,
            limit: firstQueryValue(req.query.limit),
            cursor: firstQueryValue(req.query.cursor),
        });
        return res.status(200).json({
            success: true,
            data: result.data,
            has_more: result.hasMore,
            next_cursor: result.nextCursor,
            partial: result.partial,
            pagination: {
                limit: result.data.length,
                hasMore: result.hasMore,
                nextCursor: result.nextCursor,
            },
        });
    } catch (error) {
        if (error instanceof ReelsFeedInputError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        try { reportApiError(error, req); } catch (_) { /* telemetry cannot mask the response */ }
        console.warn('[api/reels/mine] failed:', error?.message || error);
        return res.status(503).json({
            success: false,
            error: 'Your Reels collection is temporarily unavailable',
        });
    }
}
