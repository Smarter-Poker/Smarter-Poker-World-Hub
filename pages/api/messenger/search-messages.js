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
import { escapeLikeQuery } from '../../../src/utils/messageSanitizer';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
            // Security: verify caller is a participant in this conversation
            const { data: participant, error: partErr } = await getSupabase()
                .from('social_conversation_participants')
                .select('id')
                .eq('conversation_id', conversationId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (partErr || !participant) {
                return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
            }

            // Escape LIKE wildcards to prevent accidental full-table scans
            const escapedQuery = escapeLikeQuery(query.trim());

            const { data: messages, error: searchErr } = await getSupabase()
                .from('social_messages')
                .select('id, content, created_at, sender_id')
                .eq('conversation_id', conversationId)
                .eq('is_deleted', false)
                .ilike('content', `%${escapedQuery}%`)
                .order('created_at', { ascending: false })
                .limit(50);

            if (searchErr) throw searchErr;

            return res.json({ success: true, results: messages || [] });
        } catch (e) {
            console.warn('[search-messages] Exception:', e);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
