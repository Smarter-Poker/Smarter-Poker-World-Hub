/**
 * DELETE /api/notifications/delete — Delete one or more notifications
 * Body: { ids: string[] } or { id: string }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
        const deleteIds = ids || (id ? [id] : []);

        if (!deleteIds.length) {
            return res.status(400).json({ success: false, error: 'No notification id(s) provided' });
        }

        // Delete only notifications belonging to this user
        const { error } = await getSupabase()
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .in('id', deleteIds);

        if (error) {
            console.error('[Notifications Delete] Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete' });
        }

        return res.status(200).json({ success: true, deleted: deleteIds.length });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
