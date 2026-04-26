import { createClient } from '../../../../src/lib/supabaseServerClient';
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
 * GET /api/poker/checkins/popular-hours?venue_id=X
 * Returns check-in distribution by hour of day (last 30 days).
 * Similar to Google Maps "Popular Times" chart.
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
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .eq('venue_id', String(venueIdNum))
            .gte('created_at', thirtyDaysAgo)
            .limit(5000);

        if (error) {
            console.warn('Popular hours query error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Initialize 24 hours
        const hours = [];
        for (let h = 0; h < 24; h++) {
            hours.push({
                hour: h,
                label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
                count: 0,
            });
        }

        // Tally by hour
        if (checkins) {
            for (const c of checkins) {
                const hour = new Date(c.created_at).getUTCHours();
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
            totalCheckins: checkins ? checkins.length : 0,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Popular Hours Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
