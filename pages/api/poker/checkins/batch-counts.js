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
 * GET /api/poker/checkins/batch-counts?venue_ids=1,2,3
 * Returns check-in counts for multiple venues in a single request (last 24 hours).
 * Response: { success: true, counts: { "1": 5, "2": 0, "3": 12 } }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // venue_ids can arrive as:
    //   - "1,2,3"            (string, common case)
    //   - "[1,2,3]"          (JSON-encoded string)
    //   - ["1","2","3"]      (Next.js parses repeated ?venue_ids=1&venue_ids=2 to array)
    //   - undefined/null
    // Normalize to a string-array up front. Previous version called
    // .split(',') unconditionally on line 39, which crashed with
    // "TypeError: r.split is not a function" when JSON.parse succeeded
    // or the query already arrived as an array — observed in prod logs.
    let venue_ids = req.query.venue_ids;
    let ids;
    if (Array.isArray(venue_ids)) {
        ids = venue_ids;
    } else if (typeof venue_ids === 'string') {
        try {
            const parsed = JSON.parse(venue_ids);
            ids = Array.isArray(parsed) ? parsed : String(parsed).split(',');
        } catch (_e) {
            ids = venue_ids.split(',');
        }
    } else {
        return res.status(400).json({ success: false, error: 'venue_ids is required (comma-separated)' });
    }

    ids = ids
        .map(s => String(s).trim())
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
            console.warn('Batch counts error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
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
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Batch Counts Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
