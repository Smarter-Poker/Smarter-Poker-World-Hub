/**
 * POST /api/notifications/live-notify
 * Notifies followers when a user goes live.
 * Uses service-role client so it can insert notifications (RLS bypassed server-side).
 * Respects follower's user_notification_preferences.live_notifications setting.
 */
import { createClient } from '@supabase/supabase-js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { user } = await getServerUserWithFallback(req, supabaseAdmin);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { streamId, title } = req.body;
        if (!streamId) return res.status(400).json({ error: 'streamId required' });

        // Get broadcaster display name
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const displayName = profile?.username || profile?.full_name || 'Someone you follow';

        // Get all followers
        const { data: followers, error } = await supabaseAdmin
            .from('social_follows')
            .select('follower_id')
            .eq('following_id', user.id);

        if (error || !followers?.length) {
            return res.status(200).json({ notified: 0 });
        }

        // Fetch notification preferences for all followers
        const followerIds = followers.map(f => f.follower_id);
        const { data: prefs } = await supabaseAdmin
            .from('user_notification_preferences')
            .select('user_id, live_notifications')
            .in('user_id', followerIds);

        // Build preference map; default true if row missing
        const prefMap = {};
        (prefs || []).forEach(p => { prefMap[p.user_id] = p.live_notifications; });

        // Filter out followers who opted out
        const eligible = followers.filter(f => prefMap[f.follower_id] !== false);

        if (!eligible.length) return res.status(200).json({ notified: 0 });

        // Batch insert notifications in chunks of 50
        const notifications = eligible.map(f => ({
            user_id: f.follower_id,
            type: 'live',
            title: 'Live Now',
            message: `${displayName} is live: ${title || 'Live Stream'}`,
            link: `/hub/lives?id=${streamId}`,
            actor_id: user.id,
            read: false,
        }));

        const CHUNK = 50;
        for (let i = 0; i < notifications.length; i += CHUNK) {
            await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + CHUNK));
        }

        return res.status(200).json({ notified: eligible.length });
    } catch (err) {
        console.warn('[live-notify] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
