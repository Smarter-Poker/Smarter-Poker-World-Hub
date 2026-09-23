/**
 * GET /api/reels/feed
 *
 * Public, poker-only Reel feed. `id` accepts either a Reel id or its linked
 * social-post id so historical bookmarks keep resolving through the same
 * eligibility rules as ordinary feed rows.
 */
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import {
    readPokerReelsFeed,
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

export default async function handler(req, res) {
    // Every outcome carries the same non-cacheable contract, including method,
    // rate-limit, validation, not-found, and dependency-failure responses.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const id = String(firstQueryValue(req.query.id) || '').trim();
    try {
        const scope = String(firstQueryValue(req.query.scope) || '').trim().toLowerCase();
        let viewerId = null;
        if (scope === 'following') {
            const { user, error: authError } = await getServerUserWithFallback(req, getAuthClient());
            if (authError || !user?.id) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            viewerId = user.id;
        }
        const result = await readPokerReelsFeed({
            id,
            limit: firstQueryValue(req.query.limit),
            cursor: firstQueryValue(req.query.cursor),
            sort: firstQueryValue(req.query.sort),
            scope,
            viewerId,
        });

        if (result.detailStatus === 'not_found') {
            return res.status(404).json({ success: false, error: 'Reel not found' });
        }
        if (result.detailStatus === 'unavailable') {
            return res.status(410).json({ success: false, error: 'Reel is no longer available' });
        }

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
        try { reportApiError(error, req); } catch (_) { /* telemetry must not mask the response */ }
        console.warn('[api/reels/feed] failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Reels feed is temporarily unavailable' });
    }
}
