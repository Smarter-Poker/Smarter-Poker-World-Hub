import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/messenger/search-messages
 *
 * Searches messages within a specific conversation.
 * Replaces the direct client-side supabase.rpc('fn_search_messages') call
 * to enforce server-side JWT auth and participation verification.
 *
 * Body: { conversationId, query }
 * Returns: { success: true, results: [...] }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { searchMessengerWorkspace } from '../../../src/lib/messengerWorkspace.mjs';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        // Search is read-heavy but per-keystroke — use read limit
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        // Auth: verify JWT identity
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { conversationId, query } = req.body;

        if (!conversationId) {
            return res.status(400).json({ success: false, error: 'conversationId required' });
        }
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
        }

        try {
            // Resolve the exact visible conversation and its active club membership.
            // The database filters archived invoice copies before applying the cap.
            const messages = await searchMessengerWorkspace(getSupabase(), user.id, { conversationId, query }, 50);

            return res.json({ success: true, results: messages || [] });
        } catch (e) {
            console.warn('[search-messages] Exception:', e);
            return res.status([400, 403, 404, 503].includes(e.status) ? e.status : 500).json({ success: false, error: 'Message Search Unavailable' });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
