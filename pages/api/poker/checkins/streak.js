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
 * GET /api/poker/checkins/streak?user_id=X
 * Computes check-in streak data for a user.
 * Returns: { currentStreak, longestStreak, totalCheckins, lastCheckinDate }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const user_id = safeQ(req.query.user_id);
    if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id is required' });
    }

    try {
        // Fetch all check-ins for this user, ordered by date
        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('created_at')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            console.error('Streak query error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({
                success: true,
                currentStreak: 0,
                longestStreak: 0,
                totalCheckins: 0,
                lastCheckinDate: null,
            });
        }

        // Extract unique days (in user's date, UTC-based)
        const uniqueDays = new Set();
        for (const c of checkins) {
            const day = c.created_at.substring(0, 10); // YYYY-MM-DD
            uniqueDays.add(day);
        }

        // Sort days descending
        const sortedDays = Array.from(uniqueDays).sort().reverse();

        // Calculate current streak (consecutive days ending today or yesterday)
        const today = new Date().toISOString().substring(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

        let currentStreak = 0;
        if (sortedDays[0] === today || sortedDays[0] === yesterday) {
            currentStreak = 1;
            for (let i = 1; i < sortedDays.length; i++) {
                const prevDay = new Date(sortedDays[i - 1] + 'T00:00:00Z');
                const currDay = new Date(sortedDays[i] + 'T00:00:00Z');
                const diffMs = prevDay.getTime() - currDay.getTime();
                if (diffMs === 86400000) {
                    currentStreak++;
                } else {
                    break;
                }
            }
        }

        // Calculate longest streak
        let longestStreak = 1;
        let tempStreak = 1;
        const ascending = Array.from(uniqueDays).sort();
        for (let i = 1; i < ascending.length; i++) {
            const prevDay = new Date(ascending[i - 1] + 'T00:00:00Z');
            const currDay = new Date(ascending[i] + 'T00:00:00Z');
            const diffMs = currDay.getTime() - prevDay.getTime();
            if (diffMs === 86400000) {
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 1;
            }
        }

        return res.status(200).json({
            success: true,
            currentStreak,
            longestStreak,
            totalCheckins: checkins.length,
            lastCheckinDate: sortedDays[0],
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.error('[Streak API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
