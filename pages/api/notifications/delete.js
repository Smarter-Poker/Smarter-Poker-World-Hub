/**
 * DELETE /api/notifications/delete — Delete one or more notifications
 * Body: { ids: string[] } or { id: string }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { invalidateFeedCache } from './feed';
import { invalidateUnreadCache } from './unread-count';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST' && req.method !== 'DELETE') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const supabase = getSupabase();
        const { user: serverUser } = await getServerUserWithFallback(req, supabase);
        if (!serverUser) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }
        const userId = serverUser.id;

        // Support both single id and array of ids
        const { id, ids } = req.body || {};
        // [Audit#8] filter falsy/empty values — empty string "" has length=1 and bypasses check
        const rawIds = ids || (id ? [id] : []);
        const deleteIds = rawIds.filter(v => v && typeof v === 'string' && v.trim().length > 0);

        if (!deleteIds.length) {
            return res.status(400).json({ success: false, error: 'No notification id(s) provided' });
        }

        // Cap batch size to prevent abuse (max 100 per call)
        if (deleteIds.length > 100) {
            return res.status(400).json({ success: false, error: 'Too many IDs (max 100)' });
        }

        // Delete only notifications belonging to this user
        const { error } = await getSupabase()
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .in('id', deleteIds);

        if (error) {
            console.warn('[Notifications Delete] Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete' });
        }

        // Invalidate server-side feed cache so next fetch doesn't return deleted items
        invalidateFeedCache(userId);
        invalidateUnreadCache(userId);

        return res.status(200).json({ success: true, deleted: deleteIds.length });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
