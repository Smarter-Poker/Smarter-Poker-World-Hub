/**
 * Venue Activity Analytics API
 * GET /api/poker/venue-activity?venueId=xxx
 *
 * Returns hour-of-day and day-of-week activity patterns for a venue,
 * derived from historical live game data (game_snapshots or live_games).
 * Powers the "peak hours heatmap" feature.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// State -> IANA timezone (same table the DailyTournamentsPanel uses client-side).
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
 * Bucket a timestamp by the VENUE's local hour/day, not the server's (UTC on Vercel).
 * Without this a Las Vegas venue that peaks at 7 PM PT reports a 2 AM peak.
 */
function getLocalParts(value, timeZone) {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return null;
    try {
        const local = new Date(dt.toLocaleString('en-US', { timeZone }));
        if (!isNaN(local.getTime())) return { hour: local.getHours(), day: local.getDay() };
    } catch (_tzErr) { /* fall through to UTC */ }
    return { hour: dt.getUTCHours(), day: dt.getUTCDay() };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const supabase = getSupabase();
    const rawVenueId = req.query.venueId;
    const venueId = Array.isArray(rawVenueId) ? rawVenueId[0] : rawVenueId;

    if (!venueId) {
        return res.status(400).json({ error: 'venueId is required' });
    }

    try {
        // Try to get historical snapshots for this venue
        const { data: snapshots, error } = await supabase
            .from('venue_game_snapshots')
            .select('snapshot_time, table_count, total_players, game_types')
            .eq('venue_id', venueId)
            .order('snapshot_time', { ascending: false })
            .limit(500);

        if (error) {
            // Table might not exist yet — return empty analytics
            console.warn('[VenueActivity] Snapshot query error:', error.message);
            return res.status(200).json({
                venueId,
                hasData: false,
                message: 'No historical data available yet',
                hourlyActivity: [],
                weekdayActivity: [],
            });
        }

        if (!snapshots || snapshots.length === 0) {
            return res.status(200).json({
                venueId,
                hasData: false,
                message: 'No historical data available yet',
                hourlyActivity: [],
                weekdayActivity: [],
            });
        }

        // Resolve the venue's timezone so buckets are in venue-local time
        let venueTz = 'America/New_York';
        const venueIdNum = parseInt(venueId, 10);
        if (!isNaN(venueIdNum) && venueIdNum > 0) {
            try {
                const { data: venueRow } = await supabase
                    .from('poker_venues')
                    .select('state')
                    .eq('id', venueIdNum)
                    .maybeSingle();
                const st = (venueRow?.state || '').toUpperCase();
                if (IANA_TZ[st]) venueTz = IANA_TZ[st];
            } catch (_venueErr) { /* keep default tz */ }
        }

        // Aggregate by hour-of-day
        const hourBuckets = Array(24).fill(null).map(() => ({ count: 0, totalTables: 0, totalPlayers: 0 }));
        const dayBuckets = Array(7).fill(null).map(() => ({ count: 0, totalTables: 0, totalPlayers: 0 }));

        snapshots.forEach(snap => {
            const parts = getLocalParts(snap.snapshot_time, venueTz);
            if (!parts) return;
            const { hour, day } = parts;

            hourBuckets[hour].count++;
            hourBuckets[hour].totalTables += snap.table_count || 0;
            hourBuckets[hour].totalPlayers += snap.total_players || 0;

            dayBuckets[day].count++;
            dayBuckets[day].totalTables += snap.table_count || 0;
            dayBuckets[day].totalPlayers += snap.total_players || 0;
        });

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const hourlyActivity = hourBuckets.map((b, hour) => ({
            hour,
            label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'AM' : 'PM'}`,
            avgTables: b.count > 0 ? +(b.totalTables / b.count).toFixed(1) : 0,
            avgPlayers: b.count > 0 ? +(b.totalPlayers / b.count).toFixed(1) : 0,
            sampleCount: b.count,
            intensity: b.count > 0 ? Math.min(1, b.totalPlayers / b.count / 30) : 0,
        }));

        const weekdayActivity = dayBuckets.map((b, day) => ({
            day,
            label: dayNames[day],
            shortLabel: dayNames[day].substring(0, 3),
            avgTables: b.count > 0 ? +(b.totalTables / b.count).toFixed(1) : 0,
            avgPlayers: b.count > 0 ? +(b.totalPlayers / b.count).toFixed(1) : 0,
            sampleCount: b.count,
            intensity: b.count > 0 ? Math.min(1, b.totalPlayers / b.count / 30) : 0,
        }));

        // Find peak hours
        const peakHour = hourlyActivity.reduce((max, h) => h.avgPlayers > max.avgPlayers ? h : max, hourlyActivity[0]);
        const peakDay = weekdayActivity.reduce((max, d) => d.avgPlayers > max.avgPlayers ? d : max, weekdayActivity[0]);

        return res.status(200).json({
            venueId,
            hasData: true,
            totalSnapshots: snapshots.length,
            timezone: venueTz,
            peakHour: peakHour.label,
            peakDay: peakDay.label,
            hourlyActivity,
            weekdayActivity,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[VenueActivity] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
