/**
 * GET /api/social/who-shared?post_id=xxx
 * Returns profiles of users who shared a given post, plus destination breakdown.
 * Also returns current user's share streak.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    // Public-read allowed; user needed only for streak

    const { post_id } = req.query;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    try {
        // 1. Get share events for this post
        const { data: events } = await supabase
            .from('share_events')
            .select('user_id, destination, created_at')
            .eq('post_id', post_id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (!events || events.length === 0) {
            return res.json({ success: true, sharers: [], total: 0, breakdown: {}, streak: null });
        }

        // 2. Resolve sharer profiles (deduplicated)
        const uniqueUserIds = [...new Set(events.map(e => e.user_id))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, is_vip')
            .in('id', uniqueUserIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        const sharers = uniqueUserIds
            .map(id => profileMap[id])
            .filter(Boolean)
            .slice(0, 24); // cap at 24 for display

        // 3. Destination breakdown
        const breakdown = events.reduce((acc, e) => {
            acc[e.destination] = (acc[e.destination] || 0) + 1;
            return acc;
        }, {});

        // 4. Current user's active share streak
        let streak = null;
        if (user) {
            const { data: streakRow } = await supabase
                .from('share_streaks')
                .select('streak_days, streak_start, streak_end, is_active')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .order('streak_days', { ascending: false })
                .limit(1)
                .maybeSingle();
            streak = streakRow || null;
        }

        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
        return res.json({
            success: true,
            sharers,
            total: events.length,
            breakdown,
            streak,
        });
    } catch (err) {
        console.warn('[who-shared] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
