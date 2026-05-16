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

        // BUG-FIX-DEEP-AUDIT-R2 S-1: validate scheduled_at. The previous
        // version accepted any string from the client — past dates, year
        // 3000, malformed strings all stored. Past-dated rows then never
        // get reminded (live-reminders cron filters by `>= now()`) but
        // still bloat the table. Far-future rows clutter UIs. Hard window:
        // must parse, must be at least 1 minute in the future, must be at
        // most 90 days out. Reasonable for live broadcasting context.
        const parsedAt = new Date(scheduled_at);
        if (isNaN(parsedAt.getTime())) {
            return res.status(400).json({ error: 'scheduled_at must be a valid ISO 8601 timestamp' });
        }
        const nowMs = Date.now();
        const parsedMs = parsedAt.getTime();
        if (parsedMs < nowMs + 60_000) {
            return res.status(400).json({ error: 'scheduled_at must be at least 1 minute in the future' });
        }
        if (parsedMs > nowMs + 90 * 24 * 60 * 60 * 1000) {
            return res.status(400).json({ error: 'scheduled_at must be within 90 days' });
        }

        // BUG-FIX-DEEP-AUDIT-R2 S-2 / S-3: cap title/description length.
        // These flow directly into notification bodies for followers. An
        // unbounded title can be used to spam followers with an enormous
        // payload or break notification UIs.
        const safeTitle = String(title).trim().slice(0, 140);
        const safeDescription = description ? String(description).trim().slice(0, 500) : null;
        const safeThumb = thumbnail_url ? String(thumbnail_url).trim().slice(0, 2048) : null;
        if (!safeTitle) return res.status(400).json({ error: 'title cannot be blank' });

        const { data, error } = await supabase
            .from('scheduled_lives')
            .insert({
                broadcaster_id: user.id,
                title: safeTitle,
                description: safeDescription,
                thumbnail_url: safeThumb,
                scheduled_at: parsedAt.toISOString(),
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
        const scheduledDate = parsedAt.toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
        });

        if (followers?.length) {
            const notifications = followers.map(f => ({
                user_id: f.follower_id,
                type: 'live_scheduled',
                title: 'Upcoming Live Stream',
                message: `${displayName} is going live: "${safeTitle}" on ${scheduledDate}`,
                link: `/hub/lives`,
                actor_id: user.id,
                read: false,
            }));
            const CHUNK = 50;
            for (let i = 0; i < notifications.length; i += CHUNK) {
                const { error: err_notifications_6tpsi } = await supabase.from('notifications').insert(notifications.slice(i, i + CHUNK));
                if (err_notifications_6tpsi) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_6tpsi.message);
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
