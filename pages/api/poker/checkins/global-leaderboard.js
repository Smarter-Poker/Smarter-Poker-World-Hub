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
 * GET /api/poker/checkins/global-leaderboard?period=month|week|all
 * Returns top check-in users across ALL venues.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // The ranking changes slowly; without a cache header every visitor re-ran
    // the whole scan.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const period = safeQ(req.query.period) || 'month';

    try {
        let since = null;
        if (period === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString();
        else if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString();

        // The old query had NO .order() and a flat .limit(5000): Postgres returns
        // rows in unspecified order, so for period=all the "top players" ranking
        // and totalCheckins were derived from an arbitrary subset that could
        // differ between two identical requests. Page deterministically through
        // the whole window instead (ordered by created_at) so the aggregate is
        // over every row, not whichever 5,000 came back first.
        const PAGE = 1000;
        const MAX_PAGES = 50; // 50k check-ins
        let checkins = [];
        let truncated = false;
        for (let page = 0; page < MAX_PAGES; page++) {
            let query = getSupabase()
                .from('venue_checkins')
                .select('user_id, user_name')
                .order('created_at', { ascending: false });
            if (since) query = query.gte('created_at', since);

            const { data: pageRows, error } = await query.range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) {
                console.warn('Global leaderboard query error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            if (!pageRows || pageRows.length === 0) break;
            checkins = checkins.concat(pageRows);
            if (pageRows.length < PAGE) break;
            if (page === MAX_PAGES - 1) truncated = true;
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, leaders: [], totalCheckins: 0 });
        }

        // Aggregate by user_id (skip anon)
        const userMap = {};
        for (const c of checkins) {
            if (!c.user_id || c.user_id.startsWith('anon-')) continue;
            if (!userMap[c.user_id]) {
                userMap[c.user_id] = { user_id: c.user_id, user_name: c.user_name, count: 0 };
            }
            userMap[c.user_id].count++;
            if (c.user_name) userMap[c.user_id].user_name = c.user_name;
        }

        const sorted = Object.values(userMap || {})
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Enrich with profiles
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
            // True when the 50k paging ceiling was hit, so the counts are a
            // most-recent-window aggregate rather than the full period.
            truncated,
            period,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Global Leaderboard Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
