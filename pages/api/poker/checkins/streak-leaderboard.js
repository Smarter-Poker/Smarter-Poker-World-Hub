import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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

/**
 * GET /api/poker/checkins/streak-leaderboard
 * Returns top users by longest check-in streaks across all venues.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    try {
        // Streak length is a function of consecutive DAYS across a user's whole
        // history. The old `.limit(10000)` was silently capped at the project's
        // 1000-row ceiling, so streaks were computed from an arbitrary recent
        // slice: streaks starting before the window were cut short, older users
        // vanished entirely, and the board reshuffled as unrelated check-ins
        // pushed rows out. Page deterministically with .range() instead (same
        // pattern as checkins/global-leaderboard.js) and expose `truncated`.
        const PAGE = 1000;
        const MAX_PAGES = 50; // 50k check-ins
        let checkins = [];
        let truncated = false;
        for (let page = 0; page < MAX_PAGES; page++) {
            const { data: pageRows, error } = await getSupabase()
                .from('venue_checkins')
                .select('user_id, user_name, created_at')
                .order('created_at', { ascending: false })
                .range(page * PAGE, (page + 1) * PAGE - 1);

            if (error) {
                console.warn('Streak leaderboard error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            if (!pageRows || pageRows.length === 0) break;
            checkins = checkins.concat(pageRows);
            if (pageRows.length < PAGE) break;
            if (page === MAX_PAGES - 1) truncated = true;
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, leaders: [], truncated });
        }

        // Group by user
        const userMap = {};
        for (const c of checkins) {
            if (!c.user_id) continue;
            if (!userMap[c.user_id]) {
                userMap[c.user_id] = { user_id: c.user_id, user_name: c.user_name || 'Anonymous', dates: new Set() };
            }
            if (!c.created_at) continue;
            userMap[c.user_id].dates.add(String(c.created_at).substring(0, 10));
        }

        // Calculate longest streak per user
        const leaders = [];
        for (const [userId, data] of Object.entries(userMap || {})) {
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

        return res.status(200).json({ success: true, leaders: topLeaders, truncated });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Streak Leaderboard Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
