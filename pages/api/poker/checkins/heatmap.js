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
 * GET /api/poker/checkins/heatmap?user_id=X
 * Returns a 7x24 heatmap of check-ins by day-of-week x hour-of-day.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const user_id = safeQ(req.query.user_id);
    const venue_id = safeQ(req.query.venue_id);
    if (!user_id && !venue_id) {
        return res.status(400).json({ success: false, error: 'user_id or venue_id is required' });
    }

    try {
        let query = getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (user_id) query = query.eq('user_id', user_id);
        if (venue_id) query = query.eq('venue_id', String(venue_id));

        const { data: checkins, error } = await query;

        if (error) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Build 7x24 heatmap grid
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        let maxCount = 0;

        for (const c of (checkins || [])) {
            const d = new Date(c.created_at);
            const day = d.getUTCDay();
            const hour = d.getUTCHours();
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
            totalCheckins: checkins?.length || 0,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[Heatmap Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
