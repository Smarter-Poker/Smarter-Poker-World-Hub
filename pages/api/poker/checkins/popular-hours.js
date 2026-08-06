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
 * Local hour for a UTC timestamp. Bucketing with getUTCHours() published a Las
 * Vegas 7 PM peak as 2 AM — the exact defect peak-activity.js, venue-activity.js
 * and game-predictions.js were already fixed for.
 */
function getLocalHour(value, timeZone) {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return null;
    try {
        const local = new Date(dt.toLocaleString('en-US', { timeZone }));
        if (!isNaN(local.getTime())) return local.getHours();
    } catch (_tzErr) { /* fall through to UTC */ }
    return dt.getUTCHours();
}

/**
 * GET /api/poker/checkins/popular-hours?venue_id=X
 * Returns check-in distribution by hour of day (last 30 days).
 * Similar to Google Maps "Popular Times" chart.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const venue_id = safeQ(req.query.venue_id);
    if (!venue_id) {
        return res.status(400).json({ success: false, error: 'venue_id is required' });
    }

    const venueIdNum = parseInt(venue_id, 10);
    if (isNaN(venueIdNum) || venueIdNum < 1) {
        return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
    }

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .eq('venue_id', venueIdNum)
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
            // Project row cap is 1000; .limit(5000) was silently truncated and,
            // with no ORDER BY, returned an unspecified subset.
            .limit(1000);

        if (error) {
            console.warn('Popular hours query error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Resolve the venue's zone so the chart reads in venue-local time.
        let timeZone = 'America/New_York';
        try {
            const { data: venueRow } = await getSupabase()
                .from('poker_venues')
                .select('state')
                .eq('id', venueIdNum)
                .maybeSingle();
            const st = (venueRow?.state || '').toUpperCase();
            if (IANA_TZ[st]) timeZone = IANA_TZ[st];
        } catch (_tzErr) { /* keep default */ }

        // Initialize 24 hours
        const hours = [];
        for (let h = 0; h < 24; h++) {
            hours.push({
                hour: h,
                label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
                count: 0,
            });
        }

        // Tally by hour (venue-local)
        if (checkins) {
            for (const c of checkins) {
                const hour = getLocalHour(c.created_at, timeZone);
                if (hour === null || hour < 0 || hour > 23) continue;
                hours[hour].count++;
            }
        }

        const maxCount = Math.max(...hours.map(h => h.count), 1);
        const peakHour = hours.reduce((max, h) => h.count > max.count ? h : max, hours[0]);

        return res.status(200).json({
            success: true,
            hours,
            maxCount,
            peakHour: peakHour.label,
            timezone: timeZone,
            totalCheckins: checkins ? checkins.length : 0,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Popular Hours Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
