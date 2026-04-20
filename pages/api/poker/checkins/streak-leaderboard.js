import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * GET /api/poker/checkins/streak-leaderboard
 * Returns top users by longest check-in streaks across all venues.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Get all check-ins grouped by user
        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('user_id, user_name, created_at')
            .order('created_at', { ascending: false })
            .limit(10000);

        if (error) {
            console.error('Streak leaderboard error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, leaders: [] });
        }

        // Group by user
        const userMap = {};
        for (const c of checkins) {
            if (!c.user_id) continue;
            if (!userMap[c.user_id]) {
                userMap[c.user_id] = { user_id: c.user_id, user_name: c.user_name || 'Anonymous', dates: new Set() };
            }
            userMap[c.user_id].dates.add(c.created_at.substring(0, 10));
        }

        // Calculate longest streak per user
        const leaders = [];
        for (const [userId, data] of Object.entries(userMap)) {
            const sorted = Array.from(data.dates).sort();
            let longestStreak = 1;
            let currentStreak = 1;
            for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
                const curr = new Date(sorted[i] + 'T00:00:00Z');
                if (curr.getTime() - prev.getTime() === 86400000) {
                    currentStreak++;
                    longestStreak = Math.max(longestStreak, currentStreak);
                } else {
                    currentStreak = 1;
                }
            }
            leaders.push({
                user_id: userId,
                user_name: data.user_name,
                longestStreak,
                totalDays: sorted.length,
            });
        }

        // Sort by longest streak descending
        leaders.sort((a, b) => b.longestStreak - a.longestStreak || b.totalDays - a.totalDays);

        // Fetch profile pics
        const topLeaders = leaders.slice(0, 10);
        const userIds = topLeaders.map(l => l.user_id);
        if (userIds.length > 0) {
            const { data: profiles } = await getSupabase()
                .from('profiles')
                .select('id, username, avatar_url, full_name')
                .in('id', userIds);
            if (profiles) {
                const profileMap = {};
                for (const p of profiles) profileMap[p.id] = p;
                for (const l of topLeaders) {
                    const p = profileMap[l.user_id];
                    if (p) {
                        l.username = p.username || null;
                        l.avatar_url = p.avatar_url || null;
                        l.full_name = p.full_name || l.user_name;
                    }
                }
            }
        }

        return res.status(200).json({ success: true, leaders: topLeaders });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Streak Leaderboard Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
