/**
 * Venue Activity Analytics API
 * GET /api/poker/venue-activity?venueId=xxx
 *
 * Returns hour-of-day and day-of-week activity patterns for a venue,
 * derived from historical live game data (game_snapshots or live_games).
 * Powers the "peak hours heatmap" feature.
 */

import { createClient as supabaseServerClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit as apiRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const rateLimitResult = await apiRateLimit(req, { maxRequests: 60, windowMs: 60000 });
    if (rateLimitResult) return res.status(429).json({ error: 'Too many requests' });

    const supabase = supabaseServerClient(req);
    const { venueId } = req.query;

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

        // Aggregate by hour-of-day
        const hourBuckets = Array(24).fill(null).map(() => ({ count: 0, totalTables: 0, totalPlayers: 0 }));
        const dayBuckets = Array(7).fill(null).map(() => ({ count: 0, totalTables: 0, totalPlayers: 0 }));

        snapshots.forEach(snap => {
            const dt = new Date(snap.snapshot_time);
            const hour = dt.getHours();
            const day = dt.getDay();

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
            peakHour: peakHour.label,
            peakDay: peakDay.label,
            hourlyActivity,
            weekdayActivity,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[VenueActivity] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
