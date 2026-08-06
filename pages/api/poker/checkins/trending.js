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
 * GET /api/poker/checkins/trending
 * Returns top venues by check-in count in the last 24 hours.
 * Response: { success: true, venues: [{ venue_id, venue_name, city, state, count }] }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    try {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const limit = Math.min(parseInt(safeQ(req.query.limit), 10) || 5, 20);
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000;

        // Get all check-ins in the last 24 hours
        // (created_at + user_id are needed for the 6h velocity and unique-user math)
        //
        // This had no .limit(), .range() or .order(): PostgREST capped the
        // response at the project maximum (1000) and, with no ORDER BY, Postgres
        // returned an unspecified subset — so the ranking could differ between
        // two identical requests once volume passed 1000/day. Page
        // deterministically (same pattern as checkins/global-leaderboard.js).
        const PAGE = 1000;
        const MAX_PAGES = 20; // 20,000 check-ins / 24h ceiling
        let checkins = [];
        let truncated = false;
        for (let page = 0; page < MAX_PAGES; page++) {
            const { data: pageRows, error } = await getSupabase()
                .from('venue_checkins')
                .select('venue_id, user_id, user_name, created_at')
                .gte('created_at', twentyFourHoursAgo)
                .order('created_at', { ascending: false })
                .range(page * PAGE, (page + 1) * PAGE - 1);

            if (error) {
                console.warn('Trending checkins error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            if (!pageRows || pageRows.length === 0) break;
            checkins = checkins.concat(pageRows);
            if (pageRows.length < PAGE) break;
            if (page === MAX_PAGES - 1) truncated = true;
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, venues: [], total: 0, truncated });
        }

        // Aggregate by venue_id
        const countMap = {};
        for (const c of checkins) {
            if (!countMap[c.venue_id]) {
                countMap[c.venue_id] = { venue_id: c.venue_id, count: 0, recent6h: 0, uniqueUsers: new Set() };
            }
            countMap[c.venue_id].count++;
            // recent6h was read below but never computed, so 'rising' was unreachable.
            const ts = c.created_at ? Date.parse(c.created_at) : NaN;
            if (!isNaN(ts) && ts >= sixHoursAgoMs) countMap[c.venue_id].recent6h++;
            // Dedup on user_id — distinct users sharing a display name were collapsed.
            countMap[c.venue_id].uniqueUsers.add(c.user_id || c.user_name);
        }

        // Sort by count descending, take top N
        const sorted = Object.values(countMap || {})
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        // Resolve venue names from poker_venues table
        const venueIds = sorted.map(v => parseInt(v.venue_id, 10)).filter(n => !isNaN(n) && n > 0);
        let venueMap = {};

        if (venueIds.length > 0) {
            const { data: venues } = await getSupabase()
                .from('poker_venues')
                .select('id, name, city, state')
                .in('id', venueIds);

            if (venues) {
                for (const v of venues) {
                    venueMap[String(v.id)] = v;
                }
            }
        }

        // Build response with trend indicators
        const result = sorted.map(s => {
            const venue = venueMap[s.venue_id] || {};
            // Velocity: what % of 24h activity happened in last 6h
            const velocityRatio = s.count > 0 ? (s.recent6h || 0) / s.count : 0;
            let trend = 'steady';
            if (velocityRatio > 0.6 && (s.recent6h || 0) >= 2) trend = 'rising';
            else if (s.uniqueUsers.size >= 3) trend = 'hot';
            return {
                venue_id: parseInt(s.venue_id, 10),
                venue_name: venue.name || `Venue #${s.venue_id}`,
                city: venue.city || null,
                state: venue.state || null,
                count: s.count,
                recent_6h: s.recent6h || 0,
                unique_users: s.uniqueUsers.size,
                trend,
            };
        }).filter(v => v.venue_name && v.venue_name !== `Venue #${v.venue_id}`);

        return res.status(200).json({
            success: true,
            venues: result,
            total: checkins.length,
            truncated,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Trending Checkins Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
