/**
 * /api/live/schedule
 * GET  ?broadcaster_id=xxx — list upcoming scheduled lives
 * POST — create a scheduled live
 * DELETE ?id=xxx — cancel a scheduled live
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const limitType = req.method === 'GET' ? LIMITS.read : LIMITS.write;
    if (!applyRateLimit(req, res, limitType)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
        const { broadcaster_id } = req.query;
        const { data, error } = await supabase
            .from('scheduled_lives')
            .select('*, broadcaster:profiles(id, username, full_name, avatar_url)')
            .eq('broadcaster_id', broadcaster_id || user.id)
            .gte('scheduled_at', new Date().toISOString())
            .order('scheduled_at', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ data: data || [] });
    }

    if (req.method === 'POST') {
        const { title, description, thumbnail_url, scheduled_at } = req.body;
        if (!title || !scheduled_at) return res.status(400).json({ error: 'title and scheduled_at required' });

        const { data, error } = await supabase
            .from('scheduled_lives')
            .insert({
                broadcaster_id: user.id,
                title,
                description,
                thumbnail_url,
                scheduled_at,
            })
            .select()
            .maybeSingle();

        if (error) return res.status(500).json({ error: error.message });

        // Notify followers about scheduled live
        const { data: followers } = await supabase
            .from('social_follows')
            .select('follower_id')
            .eq('following_id', user.id);

        const { data: profile } = await supabase
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();

        const displayName = profile?.username || profile?.full_name || 'Someone you follow';
        const scheduledDate = new Date(scheduled_at).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
        });

        if (followers?.length) {
            const notifications = followers.map(f => ({
                user_id: f.follower_id,
                type: 'live_scheduled',
                title: 'Upcoming Live Stream',
                message: `${displayName} is going live: "${title}" on ${scheduledDate}`,
                link: `/hub/lives`,
                actor_id: user.id,
                read: false,
            }));
            const CHUNK = 50;
            for (let i = 0; i < notifications.length; i += CHUNK) {
                await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
            }
        }

        return res.json({ data });
    }

    if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id required' });

        const { error } = await supabase
            .from('scheduled_lives')
            .delete()
            .eq('id', id)
            .eq('broadcaster_id', user.id);

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
