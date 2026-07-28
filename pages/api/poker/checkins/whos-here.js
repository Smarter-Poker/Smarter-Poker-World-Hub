import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
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
 * GET /api/poker/checkins/whos-here?venue_id=X
 * Returns users currently checked in at a venue (within last 4 hours).
 * If JWT is provided, cross-references with caller's friends list.
 * Response: { success: true, total: N, people: [...], friends: [...] }
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

        // Try to enrich with profile data (avatar, full_name)
        const userIds = uniquePeople.map(p => p.user_id).filter(id => id && !id.startsWith('anon-'));
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
        const enrichedPeople = uniquePeople.map(p => {
            const profile = profileMap[p.user_id];
            return {
                ...p,
                full_name: profile?.full_name || p.user_name,
                username: profile?.username || null,
                avatar_url: profile?.avatar_url || null,
            };
        });

        // Cross-reference with caller's friends if JWT provided
        let friendsHere = [];
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
                  const authData = { user: authUser };
                /* removed duplicate authUser */
                if (authUser) {
                    // Get caller's friends
                    const { data: friendships } = await getSupabase()
                        .from('friendships')
                        .select('user_id, friend_id')
                        .eq('status', 'accepted')
                        .or(`user_id.eq.${authUser.id},friend_id.eq.${authUser.id}`);

                    if (friendships) {
                        const friendIds = new Set(
                            friendships.map(f => f.user_id === authUser.id ? f.friend_id : f.user_id)
                        );
                        friendsHere = enrichedPeople.filter(p => friendIds.has(p.user_id));
                    }
                }
            } catch { /* JWT invalid or expired — skip friends */ }
        }

        return res.status(200).json({
            success: true,
            total: enrichedPeople.length,
            people: enrichedPeople,
            friends: friendsHere,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Whos-Here API Error]', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
