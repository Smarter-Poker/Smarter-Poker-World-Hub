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
 * GET /api/poker/checkins/badges?user_id=X
 * Computes achievement badges earned from check-in history.
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
        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('venue_id, created_at')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .limit(2000);

        if (error) {
            console.error('Badges query error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        const total = checkins ? checkins.length : 0;
        const badges = [];

        if (total === 0) {
            return res.status(200).json({ success: true, badges, totalCheckins: 0 });
        }

        // Unique venues
        const venueSet = new Set(checkins.map(c => c.venue_id));
        const uniqueVenues = venueSet.size;

        // Venue frequency map
        const venueCountMap = {};
        for (const c of checkins) {
            venueCountMap[c.venue_id] = (venueCountMap[c.venue_id] || 0) + 1;
        }
        const maxAtOneVenue = Math.max(...Object.values(venueCountMap));

        // Resolve states for venue IDs
        const venueIds = [...venueSet].map(v => parseInt(v, 10)).filter(n => !isNaN(n) && n > 0);
        let uniqueStates = 0;
        if (venueIds.length > 0) {
            const { data: venues } = await getSupabase()
                .from('poker_venues')
                .select('id, state')
                .in('id', venueIds);
            if (venues) {
                const stateSet = new Set(venues.map(v => v.state).filter(Boolean));
                uniqueStates = stateSet.size;
            }
        }

        // Streak calculation
        const uniqueDays = new Set();
        for (const c of checkins) uniqueDays.add(c.created_at.substring(0, 10));
        const ascending = Array.from(uniqueDays).sort();
        let longestStreak = 1;
        let tempStreak = 1;
        for (let i = 1; i < ascending.length; i++) {
            const prev = new Date(ascending[i - 1] + 'T00:00:00Z');
            const curr = new Date(ascending[i] + 'T00:00:00Z');
            if (curr.getTime() - prev.getTime() === 86400000) {
                tempStreak++;
                longestStreak = Math.max(longestStreak, tempStreak);
            } else {
                tempStreak = 1;
            }
        }

        // Award badges
        if (total >= 1) badges.push({ id: 'first_timer', name: 'First Timer', icon: '📍', desc: 'Made your first check-in', tier: 'bronze' });
        if (total >= 10) badges.push({ id: 'regular', name: 'Regular', icon: '⭐', desc: '10 total check-ins', tier: 'silver' });
        if (total >= 50) badges.push({ id: 'veteran', name: 'Veteran', icon: '🏅', desc: '50 total check-ins', tier: 'gold' });
        if (total >= 100) badges.push({ id: 'legend', name: 'Legend', icon: '👑', desc: '100 total check-ins', tier: 'platinum' });
        if (maxAtOneVenue >= 10) badges.push({ id: 'loyal', name: 'Loyal Regular', icon: '🏠', desc: '10+ check-ins at one venue', tier: 'silver' });
        if (maxAtOneVenue >= 25) badges.push({ id: 'vip', name: 'VIP Status', icon: '💎', desc: '25+ check-ins at one venue', tier: 'gold' });
        if (uniqueVenues >= 5) badges.push({ id: 'explorer', name: 'Explorer', icon: '🧭', desc: 'Checked in at 5+ venues', tier: 'silver' });
        if (uniqueVenues >= 20) badges.push({ id: 'globetrotter', name: 'Globetrotter', icon: '🌍', desc: 'Checked in at 20+ venues', tier: 'gold' });
        if (uniqueStates >= 3) badges.push({ id: 'road_warrior', name: 'Road Warrior', icon: '🚗', desc: 'Checked in across 3+ states', tier: 'silver' });
        if (uniqueStates >= 10) badges.push({ id: 'national', name: 'National Circuit', icon: '🇺🇸', desc: 'Checked in across 10+ states', tier: 'gold' });
        if (longestStreak >= 7) badges.push({ id: 'streak_master', name: 'Streak Master', icon: '🔥', desc: '7-day check-in streak', tier: 'silver' });
        if (longestStreak >= 30) badges.push({ id: 'iron_will', name: 'Iron Will', icon: '⚡', desc: '30-day check-in streak', tier: 'gold' });

        // Compute next badge progress
        const thresholds = [
            { id: 'regular', name: 'Regular', threshold: 10, metric: 'total', current: total },
            { id: 'veteran', name: 'Veteran', threshold: 50, metric: 'total', current: total },
            { id: 'legend', name: 'Legend', threshold: 100, metric: 'total', current: total },
            { id: 'explorer', name: 'Explorer', threshold: 5, metric: 'venues', current: uniqueVenues },
            { id: 'globetrotter', name: 'Globetrotter', threshold: 20, metric: 'venues', current: uniqueVenues },
            { id: 'road_warrior', name: 'Road Warrior', threshold: 3, metric: 'states', current: uniqueStates },
            { id: 'streak_master', name: 'Streak Master', threshold: 7, metric: 'streak', current: longestStreak },
        ];
        const earnedIds = new Set(badges.map(b => b.id));
        const nextBadge = thresholds.find(t => !earnedIds.has(t.id));

        return res.status(200).json({
            success: true,
            badges,
            totalCheckins: total,
            uniqueVenues,
            uniqueStates,
            longestStreak,
            maxAtOneVenue,
            nextBadge: nextBadge ? {
                id: nextBadge.id,
                name: nextBadge.name,
                threshold: nextBadge.threshold,
                current: nextBadge.current,
                metric: nextBadge.metric,
                progress: Math.min(1, nextBadge.current / nextBadge.threshold),
            } : null,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[Badges Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
