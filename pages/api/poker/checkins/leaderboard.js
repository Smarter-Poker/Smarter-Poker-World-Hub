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
 * GET /api/poker/checkins/leaderboard?venue_id=X&period=week|month|all
 * Returns top check-in users at a venue, ranked by frequency.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const venue_id = safeQ(req.query.venue_id);
    const period = safeQ(req.query.period) || 'month';
    if (!venue_id) {
        return res.status(400).json({ success: false, error: 'venue_id is required' });
    }

    const venueIdNum = parseInt(venue_id, 10);
    if (isNaN(venueIdNum) || venueIdNum < 1) {
        return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
    }

    try {
        // Calculate time range
        let since = null;
        if (period === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString();
        else if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString();
        // 'all' = no filter

        let query = getSupabase()
            .from('venue_checkins')
            .select('user_id, user_name')
            .eq('venue_id', String(venueIdNum));

        if (since) query = query.gte('created_at', since);

        const { data: checkins, error } = await query.limit(2000);

        if (error) {
            console.warn('[Leaderboard API] Query error:', error);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, leaders: [], totalCheckins: 0 });
        }

        // Aggregate by user_id
        const userMap = {};
        for (const c of checkins) {
            if (!c.user_id || c.user_id.startsWith('anon-')) continue;
            if (!userMap[c.user_id]) {
                userMap[c.user_id] = { user_id: c.user_id, user_name: c.user_name, count: 0 };
            }
            userMap[c.user_id].count++;
            // Keep most recent name
            if (c.user_name) userMap[c.user_id].user_name = c.user_name;
        }

        // Sort by count descending, take top 10
        const sorted = Object.values(userMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Enrich with profile data
        const userIds = sorted.map(s => s.user_id);
        if (userIds.length > 0) {
            const { data: profiles } = await getSupabase()
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', userIds);
            if (profiles) {
                const profileMap = {};
                for (const p of profiles) profileMap[p.id] = p;
                for (const leader of sorted) {
                    const p = profileMap[leader.user_id];
                    if (p) {
                        leader.username = p.username || null;
                        leader.full_name = p.full_name || leader.user_name;
                        leader.avatar_url = p.avatar_url || null;
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            leaders: sorted,
            totalCheckins: checkins.length,
            period,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Leaderboard Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
