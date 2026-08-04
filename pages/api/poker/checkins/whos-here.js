import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
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
 * GET /api/poker/checkins/whos-here?venue_id=X
 *
 * Returns who is currently checked in at a venue (within the last 4 hours).
 *
 * SECURITY (was: unauthenticated real-time location tracking of named users):
 * this endpoint used to require no auth and no rate limit while returning
 * user_id, user_name, full_name, username, avatar_url and checked_in_at for
 * everyone physically present at a venue — the whole country's poker rooms
 * were scrapeable in real time by anonymous callers. The named list is now
 * restricted to the caller's accepted friends (plus the caller); everyone
 * else contributes only to the aggregate `total`.
 *
 * Response: { success, total, people: [...friends only...], friends: [...] }
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // Presence is per-caller now — it must never land in a shared cache.
    res.setHeader('Cache-Control', 'private, no-store');

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
        // Identity is required: the response describes where identifiable people
        // physically are right now.
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'Auth required to view who is here' });
        }
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !authUser) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

        // Get all recent check-ins at this venue
        const { data: checkins, error } = await getSupabase()
            .from('venue_checkins')
            .select('user_id, user_name, created_at')
            .eq('venue_id', String(venueIdNum))
            .gte('created_at', fourHoursAgo)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[Whos-here] Query error:', error);
            return res.status(500).json({ success: false, error: 'Database query failed' });
        }

        if (!checkins || checkins.length === 0) {
            return res.status(200).json({ success: true, total: 0, people: [], friends: [] });
        }

        // Deduplicate by user_id (keep most recent)
        const seen = new Map();
        for (const c of checkins) {
            if (!seen.has(c.user_id)) {
                seen.set(c.user_id, {
                    user_id: c.user_id,
                    user_name: c.user_name,
                    checked_in_at: c.created_at,
                });
            }
        }
        const uniquePeople = Array.from(seen.values());
        const totalHere = uniquePeople.length;

        // Resolve the caller's accepted friends BEFORE any names are assembled,
        // so nobody outside that set is ever enriched or serialised.
        const friendIds = new Set();
        try {
            const { data: friendships } = await getSupabase()
                .from('friendships')
                .select('user_id, friend_id')
                .eq('status', 'accepted')
                .or(`user_id.eq.${authUser.id},friend_id.eq.${authUser.id}`);
            if (friendships) {
                for (const f of friendships) {
                    friendIds.add(f.user_id === authUser.id ? f.friend_id : f.user_id);
                }
            }
        } catch (friendErr) {
            console.warn('[Whos-here] Friend lookup failed (non-fatal):', friendErr?.message || friendErr);
        }

        // Visible = the caller plus their accepted friends. Everyone else is
        // counted in `total` only.
        const visiblePeople = uniquePeople.filter(
            p => p.user_id === authUser.id || friendIds.has(p.user_id)
        );

        if (visiblePeople.length === 0) {
            return res.status(200).json({
                success: true,
                total: totalHere,
                people: [],
                friends: [],
                hidden_count: totalHere,
            });
        }

        // Try to enrich with profile data (avatar, full_name)
        const userIds = visiblePeople.map(p => p.user_id).filter(id => id && !id.startsWith('anon-'));
        let profileMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await getSupabase()
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', userIds);
            if (profiles) {
                for (const p of profiles) {
                    profileMap[p.id] = p;
                }
            }
        }

        // Enrich people with profile data
        const enrichedPeople = visiblePeople.map(p => {
            const profile = profileMap[p.user_id];
            return {
                ...p,
                full_name: profile?.full_name || p.user_name,
                username: profile?.username || null,
                avatar_url: profile?.avatar_url || null,
            };
        });

        const friendsHere = enrichedPeople.filter(p => friendIds.has(p.user_id));

        return res.status(200).json({
            success: true,
            // Aggregate headcount stays truthful for everyone at the venue…
            total: totalHere,
            // …but only the caller and their accepted friends are named.
            people: enrichedPeople,
            friends: friendsHere,
            hidden_count: Math.max(0, totalHere - enrichedPeople.length),
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Whos-Here API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
