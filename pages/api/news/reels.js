/**
 * Reels API - Get canonical, playable poker Reels for News.
 *
 * The response retains the historical `{ success, data }` shape while the
 * shared reader enforces the same topic, availability and deduplication rules
 * used by the primary Reels endpoint.
 */
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { readPokerReelsFeed } from '../../../src/lib/server/reelsFeed';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

function clampInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function safeQueryValue(value) {
    if (!value) return value;
    if (Array.isArray(value)) return String(value[0]);
    return typeof value === 'object' ? null : String(value);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        try {
            const limit = clampInt(safeQueryValue(req.query.limit), 20, 1, 100);
            const requestedSort = safeQueryValue(req.query.sort) || 'recent';
            const sort = requestedSort === 'popular' ? 'popular' : 'recent';
            const result = await readPokerReelsFeed({ limit, sort, scope: 'all' });
            let reels = result.data;

            // Preserve the existing random mode without making its order part
            // of the stable cursor contract used by the canonical endpoint.
            if (requestedSort === 'random') {
                reels = reels.slice();
                for (let index = reels.length - 1; index > 0; index -= 1) {
                    const swapIndex = Math.floor(Math.random() * (index + 1));
                    [reels[index], reels[swapIndex]] = [reels[swapIndex], reels[index]];
                }
            }

            return res.status(200).json({ success: true, data: reels });
        } catch (error) {
            try { reportApiError(error, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
            console.warn('Reels API exception:', error?.message || error);
            return res.status(500).json({ success: false, error: 'Reels feed unavailable' });
        }
    } catch (error) {
        try { reportApiError(error, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[API Error]', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
