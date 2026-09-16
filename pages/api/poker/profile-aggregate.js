import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { applyCors } = require('../../../src/lib/cors');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET', headers: 'Content-Type, Authorization' })) return;
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'private, no-store');

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const user_id = safeQ(req.query.user_id);
    const social_id = safeQ(req.query.social_id) || user_id;

    if (!user_id || !UUID_RE.test(user_id)) {
        return res.status(400).json({ success: false, error: 'Valid user_id required' });
    }

    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const isOwner = user_id === authUser.id;

        // Security check for check-ins (owner or friend)
        if (!isOwner) {
            const { data: friendships } = await getSupabase()
                .from('friendships')
                .select('user_id, friend_id')
                .eq('status', 'accepted')
                .or(`and(user_id.eq.${authUser.id},friend_id.eq.${user_id}),and(user_id.eq.${user_id},friend_id.eq.${authUser.id})`)
                .limit(1);
            if (!friendships || friendships.length === 0) {
                return res.status(403).json({ success: false, error: 'Not authorized to view these stats' });
            }
        }

        // Fetch all data in parallel
        const [
            { data: checkins, error: checkinsErr },
            { data: pokerVenues },
            { data: following },
            { data: shareStreak }
        ] = await Promise.all([
            // 1. Checkins
            // The column is `message`, and this asked for `text`. Postgres
            // answers 42703, the `if (checkinsErr)` below returns 500, and this
            // endpoint has been dead for every profile since it shipped.
            getSupabase()
                .from('venue_checkins')
                .select('venue_id, created_at, message')
                .eq('user_id', user_id)
                .order('created_at', { ascending: false })
                .limit(2000),
                
            // 2. We will fetch venues sequentially AFTER checkins to know which IDs to fetch
            Promise.resolve({ data: [] }), 
            
            // 3. Following (only for owner)
            // Four separate fictions lived in the old version of this query, and
            // none of them could ever have returned a row:
            //   .eq('follower_id') - the column is `user_id`
            //   created_at         - the column is `followed_at`
            //   the three embeds   - page_followers has NO foreign key to
            //                        poker_venues, tours or tournament_series,
            //                        so PostgREST answers PGRST200
            //   tours              - that table does not exist at all
            // The error was destructured away (no `error:` binding), so the
            // Following tab has silently rendered empty rather than failing.
            // Details are hydrated below the same way venues already are.
            isOwner ? getSupabase()
                .from('page_followers')
                .select('page_id, page_type, followed_at')
                .eq('user_id', user_id) : Promise.resolve({ data: [] }),
                
            // 4. Share Streaks
            getSupabase()
                .from('share_streaks')
                .select('*')
                .eq('user_id', social_id)
                .eq('is_active', true)
                .order('streak_days', { ascending: false })
                .limit(1)
                .maybeSingle()
        ]);

        if (checkinsErr) {
            console.warn('Checkins error:', checkinsErr);
            return res.status(500).json({ success: false, error: 'Failed to fetch checkins' });
        }

        const safeCheckins = checkins || [];
        
        // Extract unique venue IDs to fetch their details
        const venueIds = [...new Set(safeCheckins.map(c => parseInt(c.venue_id, 10)).filter(n => !isNaN(n) && n > 0))];
        let venuesMap = {};
        
        if (venueIds.length > 0) {
            const { data: venues } = await getSupabase()
                .from('poker_venues')
                // No `emoji` column exists on poker_venues. Asking for it made
                // this whole select 42703, so no checkin ever got its venue.
                .select('id, name, city, state')
                .in('id', venueIds);
                
            if (venues) {
                venues.forEach(v => { venuesMap[String(v.id)] = v; });
            }
        }

        // Compute Checkins (enrich top 50 with venue info for the feed)
        // `text` is kept alongside `message` so any consumer written against
        // the old (broken) shape still resolves rather than rendering blank.
        const enrichedCheckins = safeCheckins.slice(0, 50).map(c => ({
            ...c,
            text: c.message ?? null,
            poker_venues: venuesMap[c.venue_id] || null
        }));

        // Compute Streak
        let currentStreak = 0;
        let longestStreak = 0;
        let lastCheckinDate = null;
        
        const uniqueDays = new Set();
        for (const c of safeCheckins) uniqueDays.add(c.created_at.substring(0, 10));
        
        if (uniqueDays.size > 0) {
            const sortedDays = Array.from(uniqueDays).sort().reverse();
            lastCheckinDate = sortedDays[0];
            
            const today = new Date().toISOString().substring(0, 10);
            const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
            
            if (sortedDays[0] === today || sortedDays[0] === yesterday) {
                currentStreak = 1;
                for (let i = 1; i < sortedDays.length; i++) {
                    const prevDay = new Date(sortedDays[i - 1] + 'T00:00:00Z');
                    const currDay = new Date(sortedDays[i] + 'T00:00:00Z');
                    if (prevDay.getTime() - currDay.getTime() === 86400000) currentStreak++;
                    else break;
                }
            }
            
            const ascending = Array.from(uniqueDays).sort();
            longestStreak = 1;
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
        }

        // Compute Stats
        const total = safeCheckins.length;
        const uniqueVenues = venueIds.length;
        const uniqueStates = new Set(Object.values(venuesMap).map(v => v.state).filter(Boolean)).size;
        
        const venueCountMap = {};
        for (const c of safeCheckins) venueCountMap[c.venue_id] = (venueCountMap[c.venue_id] || 0) + 1;
        const maxAtOneVenue = Math.max(0, ...Object.values(venueCountMap));
        
        let favoriteVenue = null;
        if (total > 0) {
            const favoriteVenueId = Object.entries(venueCountMap).sort(([, a], [, b]) => b - a)[0]?.[0];
            const fav = venuesMap[favoriteVenueId];
            if (fav) {
                favoriteVenue = {
                    id: parseInt(favoriteVenueId, 10),
                    name: fav.name,
                    count: venueCountMap[favoriteVenueId]
                };
            }
        }
        
        let avgPerWeek = 0;
        if (total > 0) {
            const oldestCheckin = new Date(safeCheckins[safeCheckins.length - 1].created_at);
            const weeksSinceFirst = Math.max(1, (Date.now() - oldestCheckin.getTime()) / (7 * 86400000));
            avgPerWeek = Math.round((total / weeksSinceFirst) * 10) / 10;
        }

        // Compute Badges
        const badges = [];
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
        if (nextBadge) {
            badges._nextBadge = {
                id: nextBadge.id,
                name: nextBadge.name,
                threshold: nextBadge.threshold,
                current: nextBadge.current,
                metric: nextBadge.metric,
                progress: Math.min(1, nextBadge.current / nextBadge.threshold),
            };
        }

        // Compute Heatmap
        const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
        let maxCount = 0;
        let totalHeatmapCheckins = 0;
        const venueTotals = {};
        
        for (const c of safeCheckins) {
            const date = new Date(c.created_at);
            if (isNaN(date)) continue;
            
            const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            const day = localDate.getUTCDay();
            const hour = localDate.getUTCHours();
            
            grid[day][hour]++;
            if (grid[day][hour] > maxCount) maxCount = grid[day][hour];
            totalHeatmapCheckins++;
            
            const vName = venuesMap[c.venue_id]?.name || `Venue #${c.venue_id}`;
            venueTotals[vName] = (venueTotals[vName] || 0) + 1;
        }
        
        const topVenues = Object.entries(venueTotals)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));
            
        const dailyTotals = [0, 1, 2, 3, 4, 5, 6].map(d => ({
            day: d,
            count: grid[d].reduce((a, b) => a + b, 0)
        }));
        
        const heatmap = {
            grid,
            maxCount,
            totalCheckins: totalHeatmapCheckins,
            topVenues,
            dailyTotals
        };
        
        // Format following. Hydrate the details in one query per page type
        // rather than through embeds that have no foreign key behind them.
        const safeFollowing = following || [];
        const detailsById = { venue: {}, series: {} };

        const venueFollowIds = [...new Set(
            safeFollowing.filter(f => f.page_type === 'venue')
                .map(f => parseInt(f.page_id, 10)).filter(n => !isNaN(n) && n > 0)
        )];
        if (venueFollowIds.length > 0) {
            const { data: rows } = await getSupabase()
                .from('poker_venues')
                .select('id, name, city, state, country')
                .in('id', venueFollowIds);
            (rows || []).forEach(r => { detailsById.venue[String(r.id)] = r; });
        }

        const seriesFollowIds = [...new Set(
            safeFollowing.filter(f => f.page_type === 'series')
                .map(f => parseInt(f.page_id, 10)).filter(n => !isNaN(n) && n > 0)
        )];
        if (seriesFollowIds.length > 0) {
            const { data: rows } = await getSupabase()
                .from('tournament_series')
                .select('id, name, city, state')
                .in('id', seriesFollowIds);
            (rows || []).forEach(r => { detailsById.series[String(r.id)] = r; });
        }

        // page_type 'tour' is deliberately not hydrated: there is no `tours`
        // table in this database. Those rows come back with details: null
        // instead of taking the request down.
        const followingParsed = safeFollowing.map(f => ({
            page_id: f.page_id,
            page_type: f.page_type,
            created_at: f.followed_at,
            details: detailsById[f.page_type]?.[String(f.page_id)] || null
        }));

        // Construct final payload
        const payload = {
            success: true,
            checkins: enrichedCheckins,
            following: followingParsed,
            streak: { currentStreak, longestStreak, totalCheckins: total },
            badges: badges, // Note: _nextBadge is attached
            stats: { totalCheckins: total, uniqueVenues, uniqueStates, avgPerWeek, favoriteVenue },
            heatmap,
            shareStreak: shareStreak ? { streak_days: shareStreak.streak_days, is_active: shareStreak.is_active } : null
        };

        return res.status(200).json(payload);

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.warn('[Profile Aggregate Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
