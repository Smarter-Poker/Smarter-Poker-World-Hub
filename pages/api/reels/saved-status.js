/**
 * POST /api/reels/saved-status
 *
 * Authenticated bookmark truth for a bounded set of currently displayed Reel
 * IDs. The server resolves canonical and historical source-post aliases while
 * deriving identity exclusively from the verified bearer token.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    readSavedPokerReelsForIds,
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

function setPrivateHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Accept-Encoding, Authorization');
}

export default async function handler(req, res) {
    setPrivateHeaders(res);
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    try {
        const { user, error: authError } = await getServerUserWithFallback(req, getAuthClient());
        if (authError || !user?.id) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const data = await readSavedPokerReelsForIds({
            userId: user.id,
            reelIds: req.body?.reel_ids,
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        if (error instanceof ReelsFeedInputError) {
            return res.status(400).json({ success: false, error: error.message });
        }
        try { reportApiError(error, req); } catch (_) { /* telemetry cannot mask the response */ }
        console.warn('[api/reels/saved-status] failed:', error?.message || error);
        return res.status(503).json({
            success: false,
            error: 'Saved Reel status is temporarily unavailable',
        });
    }
}
