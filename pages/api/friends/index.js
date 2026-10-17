/**
 * Friends API — COMPREHENSIVE
 * GET  /api/friends?action=full&userId=xxx  — Returns all friends data for the page
 * GET  /api/friends?action=list&userId=xxx  — Returns just friends list
 * POST /api/friends  — Add a friend (body: { friend_id })
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

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

      // ═══ STATUS: relationship between the caller and ONE other user ═══
      //
      // Added 2026-08-12 (audit findings F-05 / dead-route sweep). Two
      // separate surfaces needed "am I friends with this person?" and neither
      // had an endpoint for it:
      //   * pages/hub/venues/[id].js called /api/social/friends, which does
      //     not exist — the friend button on every venue page was dead.
      //   * pages/hub/home-games/[slug].js polled action=status, which was
      //     never implemented, so friendState was permanently 'none'.
      //
      // Returns one of: 'friends' | 'pending_outgoing' | 'pending_incoming' |
      // 'none'. Callers that only care about "is there a request in flight"
      // can treat either pending_* as pending.
      if (action === 'status') {
        const targetUserId = (req.query.targetUserId || req.query.friend_id || '').trim();
        if (!targetUserId) {
          return res.status(400).json({ success: false, error: 'targetUserId is required' });
        }
        if (targetUserId === userId) {
          return res.status(200).json({ success: true, data: { status: 'self' } });
        }
        try {
          const { data: rows, error } = await getSupabase()
            .from('friendships')
            .select('user_id, friend_id, status')
            .or(
              `and(user_id.eq.${userId},friend_id.eq.${targetUserId}),` +
              `and(user_id.eq.${targetUserId},friend_id.eq.${userId})`
            )
            .limit(2);
          if (error) throw error;

          let status = 'none';
          for (const r of rows || []) {
            if (r.status === 'accepted') { status = 'friends'; break; }
            if (r.status === 'pending') {
              status = r.user_id === userId ? 'pending_outgoing' : 'pending_incoming';
            }
          }
          return res.status(200).json({ success: true, data: { status } });
        } catch (error) {
          console.warn('Friend status error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }
      }

      // ═══ SEARCH: Server-side profile search (bypasses RLS) ═══
      if (action === 'search') {
        const q = (req.query.q || '').trim();
        // Sanitize: strip PostgREST filter metacharacters (commas, dots, parens)
        // to prevent filter injection via crafted query strings.
        const safeQ = q.replace(/[^a-zA-Z0-9\s\-_']/g, '');
        if (!safeQ) return res.status(200).json({ success: true, data: [] });
        const { data, error } = await getSupabase()
          .from('profiles')
          .select('id, username, display_name, avatar_url, favorite_game, is_vip, is_online')
          // A stranger is found by the names they chose to show - never by
          // their legal name (owner-only since 2026-09-30, profileColumns.js).
          .or(`username.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`)
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
          const chunkSize = 150;
          const chunks = [];
          for (let i = 0; i < friendIds.length; i += chunkSize) {
            chunks.push(friendIds.slice(i, i + chunkSize));
          }
          // Chunks run a few at a time rather than one after another: a
          // player with 1,118 friends used to wait on twelve sequential
          // round trips per list, three lists per page load (5.2s measured
          // 2026-10-17). An error is an error, never a shorter list.
          const results = [];
          const parallel = 6;
          for (let i = 0; i < chunks.length; i += parallel) {
            const batch = await Promise.all(
              chunks.slice(i, i + parallel).map(async (chunk) => {
                const { data, error } = await getSupabase()
                  .from('profiles')
                  .select(fields)
                  .in('id', chunk);
                if (error) throw error;
                return data || [];
              })
            );
            batch.forEach((rows) => results.push(...rows));
          }
          return results;
        }

        // EVERY ROW, NOT THE FIRST THOUSAND (2026-10-17). PostgREST caps a
        // response at 1,000 rows whatever `.limit()` asks for, so a player
        // with 1,118 friends and 1,121 followers was shown 1,003 and 1,000.
        // Each relationship list is read page by page on a unique order.
        const ROW_PAGE = 1000;
        async function readAllRows(build) {
          const rows = [];
          for (let from = 0; from < 100000; from += ROW_PAGE) {
            const { data, error } = await build().order('id', { ascending: true }).range(from, from + ROW_PAGE - 1);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < ROW_PAGE) break;
          }
          return rows;
        }

        // Step 1: Get all accepted friendship rows (both directions)
        const [sentRows, receivedRows] = await Promise.all([
          readAllRows(() =>
            getSupabase()
              .from('friendships')
              .select('friend_id, created_at')
              .eq('user_id', userId)
              .eq('status', 'accepted')
          ),
          readAllRows(() =>
            getSupabase()
              .from('friendships')
              .select('user_id, created_at')
              .eq('friend_id', userId)
              .eq('status', 'accepted')
          ),
        ]);

        // Deduplicate friend IDs
        const friendIdSet = new Set();
        if (sentRows) sentRows.forEach(r => friendIdSet.add(r.friend_id));
        if (receivedRows) receivedRows.forEach(r => friendIdSet.add(r.user_id));
        const allFriendIds = [...friendIdSet];

        if (action === 'full') {
          // ═══ FULL DATA for friends page ═══
          // Friends, followers and suggestions are other people: no legal name,
          // no whereabouts, no last-seen (OWNER_ONLY_PROFILE_COLUMNS). Presence
          // is the public is_online flag.
          const fullFields = 'id, username, display_name, avatar_url, favorite_game, is_vip, is_online';
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
            const requesterProfiles = await resolveFriendIds(requesterIds, 'id, username, display_name, avatar_url');
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

          // 5 and 6. Following and followers, every row, resolved together.
          const [followingRaw, followerRaw] = await Promise.all([
            readAllRows(() =>
              getSupabase().from('social_follows').select('following_id').eq('follower_id', userId)
            ),
            readAllRows(() =>
              getSupabase().from('social_follows').select('follower_id').eq('following_id', userId)
            ),
          ]);
          const followingIds = followingRaw.map(f => f.following_id);
          const followerIds = followerRaw.map(f => f.follower_id);
          const [following, followers] = await Promise.all([
            resolveFriendIds(followingIds, fullFields),
            resolveFriendIds(followerIds, fullFields),
          ]);

          // 7. Suggestions — exclude self, current friends, and pending outgoing
          const existingConnectionIds = [
            ...allFriendIds,
            ...(outgoingRequests || []).map(r => r.friend_id),
          ];

          let suggestionsQuery = getSupabase()
            .from('profiles')
            .select(fullFields)
            .neq('id', userId)
            .order('is_online', { ascending: false, nullsLast: true })
            .order('created_at', { ascending: false })
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
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
