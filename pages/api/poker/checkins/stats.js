import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
 * GET /api/poker/checkins/stats[?user_id=X]
 * Returns aggregate check-in statistics for a user.
 *
 * SECURITY: totalCheckins / uniqueVenues / uniqueStates / avgPerWeek / favorite
 * venue reconstruct an individual's physical routine — the same class of data
 * pages/api/poker/checkins.js was hardened to protect. This used to accept an
 * arbitrary `user_id` with no authentication and no rate limit, and user UUIDs
 * are freely obtainable from the leaderboard endpoints. Now: JWT required, and
 * only the caller or an accepted friend may be requested. `user_id` is optional
 * and defaults to the caller.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'private, no-store');

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const requested_user_id = safeQ(req.query.user_id);

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'Auth required to view check-in stats' });
        }
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const user_id = requested_user_id || authUser.id;

        if (user_id !== authUser.id) {
            // user_id is interpolated into the PostgREST .or() filter below, so it
            // must be a plain UUID — anything else could reshape the filter.
            if (!UUID_RE.test(user_id)) {
                return res.status(400).json({ success: false, error: 'user_id must be a valid UUID' });
            }
            const { data: friendships } = await getSupabase()
                .from('friendships')
                .select('user_id, friend_id')
                .eq('status', 'accepted')
                .or(`and(user_id.eq.${authUser.id},friend_id.eq.${user_id}),and(user_id.eq.${user_id},friend_id.eq.${authUser.id})`)
                .limit(1);
            if (!friendships || friendships.length === 0) {
                return res.status(403).json({ success: false, error: 'Not authorized to view these stats' });
            }
        }

        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('venue_id, created_at')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) {
            console.warn('Stats query error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({
                success: true,
                totalCheckins: 0, uniqueVenues: 0, uniqueStates: 0,
                avgPerWeek: 0, favoriteVenue: null,
            });
        }

        const total = checkins.length;

        // Unique venues
        const venueSet = new Set(checkins.map(c => c.venue_id));
        const uniqueVenues = venueSet.size;

        // Venue frequency to find favorite
        const venueCountMap = {};
        for (const c of checkins) {
            venueCountMap[c.venue_id] = (venueCountMap[c.venue_id] || 0) + 1;
        }
        const favoriteVenueId = Object.entries(venueCountMap || {})
            .sort(([, a], [, b]) => b - a)[0]?.[0];

        // Average per week
        const oldestCheckin = new Date(checkins[checkins.length - 1].created_at);
        const weeksSinceFirst = Math.max(1, (Date.now() - oldestCheckin.getTime()) / (7 * 86400000));
        const avgPerWeek = Math.round((total / weeksSinceFirst) * 10) / 10;

        // Resolve states and favorite venue name
        const venueIds = [...venueSet].map(v => parseInt(v, 10)).filter(n => !isNaN(n) && n > 0);
        let uniqueStates = 0;
        let favoriteVenueName = null;

        if (venueIds.length > 0) {
            const { data: venues } = await getSupabase()
                .from('poker_venues')
                .select('id, name, state')
                .in('id', venueIds);
            if (venues) {
                const stateSet = new Set(venues.map(v => v.state).filter(Boolean));
                uniqueStates = stateSet.size;
                const fav = venues.find(v => String(v.id) === favoriteVenueId);
                if (fav) favoriteVenueName = fav.name;
            }
        }

        return res.status(200).json({
            success: true,
            totalCheckins: total,
            uniqueVenues,
            uniqueStates,
            avgPerWeek,
            favoriteVenue: favoriteVenueName ? {
                id: parseInt(favoriteVenueId, 10),
                name: favoriteVenueName,
                count: venueCountMap[favoriteVenueId],
            } : null,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Stats Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
