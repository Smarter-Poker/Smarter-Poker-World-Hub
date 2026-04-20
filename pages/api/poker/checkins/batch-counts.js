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
 * GET /api/poker/checkins/batch-counts?venue_ids=1,2,3
 * Returns check-in counts for multiple venues in a single request (last 24 hours).
 * Response: { success: true, counts: { "1": 5, "2": 0, "3": 12 } }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const safeQ = (v) => Array.isArray(v) ? v[0] : v;
    let venue_ids = req.query.venue_ids;
    if (typeof venue_ids === 'string') {
        try { venue_ids = JSON.parse(venue_ids); } catch (e) { venue_ids = venue_ids.split(','); }
    } else if (!Array.isArray(venue_ids)) {
        venue_ids = [];
    }
    if (!venue_ids) {
        return res.status(400).json({ success: false, error: 'venue_ids is required (comma-separated)' });
    }

    // Parse and validate venue IDs
    const ids = venue_ids.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 50); // Cap at 50 venues per request

    if (ids.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid venue_ids provided' });
    }

    // Validate all are valid integers
    const validIds = ids.map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0);
    const stringIds = validIds.map(String);

    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Fetch all check-ins for these venues in the last 24 hours
        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('venue_id')
            .in('venue_id', stringIds)
            .gte('created_at', twentyFourHoursAgo)
            .limit(1000);

        if (error) {
            console.error('Batch counts error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        // Build count map — initialize all requested IDs to 0
        const counts = {};
        for (const id of stringIds) {
            counts[id] = 0;
        }

        // Tally
        if (checkins) {
            for (const c of checkins) {
                const vid = String(c.venue_id);
                if (counts[vid] !== undefined) {
                    counts[vid]++;
                }
            }
        }

        return res.status(200).json({
            success: true,
            counts,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Batch Counts Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
