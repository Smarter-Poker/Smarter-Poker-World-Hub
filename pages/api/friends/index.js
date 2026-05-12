/**
 * Friends API — COMPREHENSIVE
 * GET  /api/friends?action=full&userId=xxx  — Returns all friends data for the page
 * GET  /api/friends?action=list&userId=xxx  — Returns just friends list
 * POST /api/friends  — Add a friend (body: { friend_id })
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Auth: local HMAC verify first, GoTrue network fallback if JWT secret missing
    const supabase = getSupabase();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
        return res.status(401).json({ success: false, error: 'Auth required' });
    }
    const userId = localUser.id;

    if (req.method === 'GET') {
      // Friends data is private per-user — safe to cache briefly in browser only
      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
      const { action = 'list' } = req.query;

      // ═══ SEARCH: Server-side profile search (bypasses RLS) ═══
      if (action === 'search') {
        const q = (req.query.q || '').trim();
        // Sanitize: strip PostgREST filter metacharacters (commas, dots, parens)
        // to prevent filter injection via crafted query strings.
        const safeQ = q.replace(/[^a-zA-Z0-9\s\-_']/g, '');
        if (!safeQ) return res.status(200).json({ success: true, data: [] });
        const { data, error } = await getSupabase()
          .from('profiles')
          .select('id, username, full_name, display_name, avatar_url, city, state, favorite_game, is_vip')
          .or(`username.ilike.%${safeQ}%,full_name.ilike.%${safeQ}%`)
          .neq('id', userId)
          .limit(50);
        if (error) {
          console.warn('[Friends] Search error:', error);
          return res.status(500).json({ success: false, error: 'Search failed' });
        }
        return res.status(200).json({ success: true, data: data || [] });
      }

      try {
        // ═══════════════════════════════════════════════════════════════════
        // HELPER: Resolve friend IDs → profile objects (two-query approach)
        // The friendships table has NO FK constraints to profiles, so
        // PostgREST FK joins (profiles!friendships_friend_id_fkey) silently
        // return null. We use a reliable two-step approach instead.
        // ═══════════════════════════════════════════════════════════════════
        async function resolveFriendIds(friendIds, fields) {
          if (!friendIds.length) return [];
          const chunkSize = 100;
          const chunks = [];
          for (let i = 0; i < friendIds.length; i += chunkSize) {
            chunks.push(friendIds.slice(i, i + chunkSize));
          }
          
          let allData = [];
          for (const chunk of chunks) {
            const { data } = await getSupabase()
              .from('profiles')
              .select(fields)
              .in('id', chunk);
            if (data) allData = allData.concat(data);
          }
          return allData;
        }

        // Step 1: Get all accepted friendship rows (both directions)
        const [sentResult, receivedResult] = await Promise.all([
          getSupabase()
            .from('friendships')
            .select('friend_id, created_at')
            .eq('user_id', userId)
            .eq('status', 'accepted')
            .limit(5000),
          getSupabase()
            .from('friendships')
            .select('user_id, created_at')
            .eq('friend_id', userId)
            .eq('status', 'accepted')
            .limit(5000),
        ]);

        const sentRows = sentResult.data;
        const receivedRows = receivedResult.data;

        // Deduplicate friend IDs
        const friendIdSet = new Set();
        if (sentRows) sentRows.forEach(r => friendIdSet.add(r.friend_id));
        if (receivedRows) receivedRows.forEach(r => friendIdSet.add(r.user_id));
        const allFriendIds = [...friendIdSet];

        if (action === 'full') {
          // ═══ FULL DATA for friends page ═══
          const fullFields = 'id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active, is_vip';
          const friends = await resolveFriendIds(allFriendIds, fullFields);

          // 3. Pending incoming requests (with requester profiles)
          const { data: incomingRaw } = await getSupabase()
            .from('friendships')
            .select('id, user_id')
            .eq('friend_id', userId)
            .eq('status', 'pending')
            .limit(100);

          let incomingRequests = [];
          if (incomingRaw?.length) {
            const requesterIds = incomingRaw.map(r => r.user_id);
            const requesterProfiles = await resolveFriendIds(requesterIds, 'id, username, full_name, display_name, avatar_url');
            const profileMap = {};
            requesterProfiles.forEach(p => { profileMap[p.id] = p; });
            incomingRequests = incomingRaw.map(r => ({
              id: r.id,
              user_id: r.user_id,
              requester: profileMap[r.user_id] || null,
            }));
          }

          // 4. Pending outgoing requests
          const { data: outgoingRequests } = await getSupabase()
            .from('friendships')
            .select('friend_id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .limit(100);

          // 5. Following — also use two-query approach
          const { data: followingRaw } = await getSupabase()
            .from('social_follows')
            .select('following_id')
            .eq('follower_id', userId)
            .limit(5000);
          const followingIds = followingRaw ? followingRaw.map(f => f.following_id) : [];
          const following = await resolveFriendIds(followingIds, fullFields);

          // 6. Followers
          const { data: followerRaw } = await getSupabase()
            .from('social_follows')
            .select('follower_id')
            .eq('following_id', userId)
            .limit(5000);
          const followerIds = followerRaw ? followerRaw.map(f => f.follower_id) : [];
          const followers = await resolveFriendIds(followerIds, fullFields);

          // 7. Suggestions — exclude self, current friends, and pending outgoing
          const existingConnectionIds = [
            ...allFriendIds,
            ...(outgoingRequests || []).map(r => r.friend_id),
          ];

          let suggestionsQuery = getSupabase()
            .from('profiles')
            .select('id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active')
            .neq('id', userId)
            .order('last_active', { ascending: false, nullsLast: true })
            .limit(500);

          // Filter out existing connections (friends + pending) if any
          const { data: allUsers } = await suggestionsQuery;

          // Client-side exclude existing connections
          const excludeSet = new Set(existingConnectionIds);
          const filteredSuggestions = (allUsers || []).filter(u => !excludeSet.has(u.id));

          return res.status(200).json({
            success: true,
            data: {
              friends,
              friendIds: allFriendIds,
              friendRequests: incomingRequests,
              pendingOutgoing: outgoingRequests || [],
              following,
              followingIds,
              followers,
              followerIds,
              suggestions: filteredSuggestions,
            }
          });
        }

        // Default: simple friends list (includes is_vip for R8-I8 VIP badge in wallet transfer)
        const friends = await resolveFriendIds(allFriendIds, 'id, display_name, username, avatar_url, is_vip');
        return res.status(200).json({ success: true, data: { friends } });

      } catch (error) {
        console.warn('Get friends error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch friends' });
      }
    }

    if (req.method === 'POST') {
      const { friend_id } = req.body;
      if (!friend_id) return res.status(400).json({ success: false, error: 'friend_id is required' });

      try {
        const { data, error } = await getSupabase()
          .from('friendships')
          .insert({ user_id: userId, friend_id, status: 'pending' })
          .select()
          .maybeSingle();
        if (error) throw error;
        return res.status(201).json({ success: true, data: { friendship: data } });
      } catch (error) {
        console.warn('Add friend error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
