import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// State -> IANA timezone (same table peak-activity.js / venue-activity.js use).
const IANA_TZ = {
    'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
    'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
    'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
    'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Denver',
    'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
    'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
    'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
    'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
    'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
    'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
    'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
    'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
    'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
    'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
    'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
    'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
    'WI': 'America/Chicago', 'WY': 'America/Denver',
};

/**
 * Bucket a timestamp by LOCAL hour/day instead of UTC.
 * check-ins are stored in UTC; getUTCHours() reported a Las Vegas 7 PM peak as
 * 2 AM and pushed Friday nights onto Saturday (same defect peak-activity.js,
 * venue-activity.js and game-predictions.js were already fixed for).
 */
function getLocalParts(value, timeZone) {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return null;
    if (timeZone) {
        try {
            const local = new Date(dt.toLocaleString('en-US', { timeZone }));
            if (!isNaN(local.getTime())) return { hour: local.getHours(), day: local.getDay() };
        } catch (_tzErr) { /* fall through to UTC */ }
    }
    return { hour: dt.getUTCHours(), day: dt.getUTCDay() };
}

/** Best-effort venue timezone from poker_venues.state; defaults to Eastern. */
async function resolveVenueTimezone(venueIdNum) {
    if (!venueIdNum) return 'America/New_York';
    try {
        const { data } = await getSupabase()
            .from('poker_venues')
            .select('state')
            .eq('id', venueIdNum)
            .maybeSingle();
        const st = (data?.state || '').toUpperCase();
        if (IANA_TZ[st]) return IANA_TZ[st];
    } catch (_err) { /* default below */ }
    return 'America/New_York';
}

/**
 * GET /api/poker/checkins/heatmap?user_id=X | ?venue_id=N
 * Returns a 7x24 heatmap of check-ins by day-of-week x hour-of-day.
 *
 * SECURITY: the user_id form is a full weekly map of when someone is physically
 * at poker rooms — the same data class checkins/stats.js and checkins.js were
 * hardened for. It used to accept an arbitrary user_id with no auth and no rate
 * limit, and user UUIDs are freely harvestable from the leaderboard endpoints.
 * Now: JWT required, self or accepted friend only. The venue_id form stays
 * public (it is venue-level aggregate, not personal).
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const requested_user_id = safeQ(req.query.user_id);
    const venue_id = safeQ(req.query.venue_id);
    if (!requested_user_id && !venue_id) {
        return res.status(400).json({ success: false, error: 'user_id or venue_id is required' });
    }

    let venueIdNum = null;
    if (venue_id) {
        venueIdNum = parseInt(venue_id, 10);
        if (isNaN(venueIdNum) || venueIdNum < 1) {
            return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
        }
    }

    try {
        let user_id = null;

        if (requested_user_id || !venueIdNum) {
            res.setHeader('Cache-Control', 'private, no-store');

            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return res.status(401).json({ success: false, error: 'Auth required to view check-in heatmaps' });
            }
            const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
            if (authErr || !authUser) {
                return res.status(401).json({ success: false, error: 'Invalid token' });
            }

            user_id = requested_user_id || authUser.id;

            if (user_id !== authUser.id) {
                // user_id is interpolated into the PostgREST .or() filter below, so
                // it must be a plain UUID — anything else could reshape the filter.
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
                    return res.status(403).json({ success: false, error: 'Not authorized to view this heatmap' });
                }
            }
        } else {
            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        }

        let query = getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1000);

        if (user_id) query = query.eq('user_id', user_id);
        if (venueIdNum) query = query.eq('venue_id', venueIdNum);

        const { data: checkins, error } = await query;

        if (error) {
            console.warn('[Heatmap] query error:', error.code, error.message);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Bucket in the venue's local zone when the request is venue-scoped.
        // A user-scoped heatmap spans many venues, so it keeps UTC buckets
        // (getLocalParts falls back to UTC when timeZone is null).
        const timeZone = venueIdNum ? await resolveVenueTimezone(venueIdNum) : null;

        // Build 7x24 heatmap grid
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        let maxCount = 0;

        for (const c of (checkins || [])) {
            const parts = getLocalParts(c.created_at, timeZone);
            if (!parts) continue;
            const { day, hour } = parts;
            grid[day][hour]++;
            if (grid[day][hour] > maxCount) maxCount = grid[day][hour];
        }

        // Also compute daily totals for the heatmap strip view
        const dailyTotals = days.map((name, i) => ({
            day: name,
            total: grid[i].reduce((s, v) => s + v, 0),
        }));

        // Find peak day and hour
        let peakDay = 0, peakHour = 0;
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                if (grid[d][h] > grid[peakDay][peakHour]) {
                    peakDay = d;
                    peakHour = h;
                }
            }
        }

        return res.status(200).json({
            success: true,
            grid,
            days,
            dailyTotals,
            maxCount,
            peakDay: days[peakDay],
            peakHour: peakHour,
            timezone: timeZone || 'UTC',
            totalCheckins: checkins?.length || 0,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Heatmap Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
