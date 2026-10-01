/**
 * GET /api/reels/profile
 *
 * Public, canonical Reels for one player profile. Raw social_reels rows must
 * never be rendered by a profile because availability, rights and linked-post
 * state can change independently after publication.
 */
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    readPublicProfileReels,
    ReelsFeedInputError,
} from '../../../src/lib/server/reelsFeed';

function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const result = await readPublicProfileReels({
            authorId: firstQueryValue(req.query.author_id),
            limit: firstQueryValue(req.query.limit),
            cursor: firstQueryValue(req.query.cursor),
        });
        return res.status(200).json({
            success: true,
            data: result.data,
            has_more: result.hasMore,
            next_cursor: result.nextCursor,
            partial: result.partial,
        });
    } catch (error) {
        if (error instanceof ReelsFeedInputError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        try { reportApiError(error, req); } catch (_) { /* telemetry must not mask response */ }
        console.warn('[api/reels/profile] failed:', error?.message || error);
        return res.status(503).json({
            success: false,
            error: 'Profile Reels are temporarily unavailable',
        });
    }
}
