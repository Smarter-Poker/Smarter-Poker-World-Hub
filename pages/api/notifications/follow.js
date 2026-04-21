/* ═══════════════════════════════════════════════════════════════════════════
   FOLLOW NOTIFICATION API
   POST /api/notifications/follow
   
   Creates a "new_follow" notification in the database when a user follows someone.
   Uses service role to bypass RLS (notification is for the FOLLOWED user, not the caller).
   Auth: Bearer token required.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
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
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Verify caller identity via JWT
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const supabase = getSupabase();
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { followingUserId } = req.body;
        if (!followingUserId) return res.status(400).json({ success: false, error: 'followingUserId required' });

        // Prevent self-notification
        if (followingUserId === user.id) return res.status(200).json({ success: true, skipped: true });

        // Look up the follower's display name
        const { data: profile } = await supabase.from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const displayName = profile?.full_name || profile?.username || user.email?.split('@')[0] || 'Someone';

        // Insert notification using service role (bypasses RLS)
        const { error } = await supabase.from('notifications').insert({
            user_id: followingUserId,
            type: 'new_follow',
            title: displayName,
            message: 'started following you',
            actor_id: user.id,
            link: `/hub/user/${profile?.username || user.id}`,
            data: { follower_id: user.id }
        });

        if (error) {
            console.error('[Follow Notification] Insert error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create notification' });
        }

        return res.status(200).json({ success: true });
    } catch (e) {
        try { reportApiError(e, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[Follow Notification] Error:', e);
        return res.status(500).json({ success: false, error: 'Internal error' });
    }
}
