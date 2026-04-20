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
 * GET /api/poker/checkins/activity?venue_id=X
 * Returns daily check-in counts for the last 7 days at a venue.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

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
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .eq('venue_id', String(venueIdNum))
            .gte('created_at', sevenDaysAgo)
            .limit(2000);

        if (error) {
            console.error('Activity query error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // Build 7-day map
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            days.push({
                date: d.toISOString().substring(0, 10),
                dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                count: 0,
            });
        }

        // Tally check-ins by day
        if (checkins) {
            for (const c of checkins) {
                const day = c.created_at.substring(0, 10);
                const entry = days.find(d => d.date === day);
                if (entry) entry.count++;
            }
        }

        const maxCount = Math.max(...days.map(d => d.count), 1);

        return res.status(200).json({
            success: true,
            days,
            maxCount,
            totalWeek: checkins ? checkins.length : 0,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Activity Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
