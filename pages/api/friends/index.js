/**
 * Friends API — COMPREHENSIVE
 * GET  /api/friends?action=full&userId=xxx  — Returns all friends data for the page
 * GET  /api/friends?action=list&userId=xxx  — Returns just friends list
 * POST /api/friends  — Add a friend (body: { friend_id })
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

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

    // Auth — local JWT decode first
    const localUser = getServerUser(req);
    let userId;
    if (localUser) {
      userId = localUser.id;
    } else {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
      userId = user.id;
    }

    if (req.method === 'GET') {
      const { action = 'list' } = req.query;

      try {
        if (action === 'full') {
          // ═══ FULL DATA for friends page ═══

          // 1. Friends where I am user_id (I sent the request)
          const { data: friendshipsAsUser } = await getSupabase()
            .from('friendships')
            .select('friend_id, friend:profiles!friendships_friend_id_fkey(id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active)')
            .eq('user_id', userId)
            .eq('status', 'accepted')
            .limit(200);

          // 2. Friends where I am friend_id (they sent the request)
          const { data: friendshipsAsFriend } = await getSupabase()
            .from('friendships')
            .select('user_id, requester:profiles!friendships_user_id_fkey(id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active)')
            .eq('friend_id', userId)
            .eq('status', 'accepted')
            .limit(200);

          const friends = [];
          const friendIds = [];

          if (friendshipsAsUser) {
            friendshipsAsUser.forEach(f => {
              if (f.friend) {
                friends.push(f.friend);
                friendIds.push(f.friend_id);
              }
            });
          }
          if (friendshipsAsFriend) {
            friendshipsAsFriend.forEach(f => {
              if (f.requester && !friendIds.includes(f.user_id)) {
                friends.push(f.requester);
                friendIds.push(f.user_id);
              }
            });
          }

          // 3. Pending incoming requests
          const { data: incomingRequests } = await getSupabase()
            .from('friendships')
            .select('id, user_id, requester:profiles!friendships_user_id_fkey(id, username, full_name, display_name, avatar_url)')
            .eq('friend_id', userId)
            .eq('status', 'pending')
            .limit(100);

          // 4. Pending outgoing requests
          const { data: outgoingRequests } = await getSupabase()
            .from('friendships')
            .select('friend_id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .limit(100);

          // 5. Following
          const { data: myFollowing } = await getSupabase()
            .from('follows')
            .select('following_id, following:profiles!follows_following_id_fkey(id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active)')
            .eq('follower_id', userId)
            .limit(200);

          // 6. Followers
          const { data: myFollowers } = await getSupabase()
            .from('follows')
            .select('follower_id, follower:profiles!follows_follower_id_fkey(id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active)')
            .eq('following_id', userId)
            .limit(200);

          // 7. Suggestions (all other users, minus friends)
          const { data: allUsers } = await getSupabase()
            .from('profiles')
            .select('id, username, full_name, display_name, avatar_url, city, state, favorite_game, last_active')
            .neq('id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

          return res.status(200).json({
            success: true,
            data: {
              friends,
              friendIds,
              friendRequests: incomingRequests || [],
              pendingOutgoing: outgoingRequests || [],
              following: myFollowing ? myFollowing.map(f => f.following).filter(Boolean) : [],
              followingIds: myFollowing ? myFollowing.map(f => f.following_id) : [],
              followers: myFollowers ? myFollowers.map(f => f.follower).filter(Boolean) : [],
              followerIds: myFollowers ? myFollowers.map(f => f.follower_id) : [],
              suggestions: allUsers || [],
            }
          });
        }

        // Default: simple friends list (includes is_vip for R8-I8 VIP badge in wallet transfer)
        const { data: friendshipsAsUser } = await getSupabase()
          .from('friendships')
          .select('friend_id, friend:profiles!friendships_friend_id_fkey(id, display_name, username, avatar_url, is_vip)')
          .eq('user_id', userId)
          .eq('status', 'accepted')
          .limit(100);

        const { data: friendshipsAsFriend } = await getSupabase()
          .from('friendships')
          .select('user_id, requester:profiles!friendships_user_id_fkey(id, display_name, username, avatar_url, is_vip)')
          .eq('friend_id', userId)
          .eq('status', 'accepted')
          .limit(100);

        const friends = [];
        if (friendshipsAsUser) friendshipsAsUser.forEach(f => { if (f.friend) friends.push(f.friend); });
        if (friendshipsAsFriend) friendshipsAsFriend.forEach(f => { if (f.requester) friends.push(f.requester); });

        return res.status(200).json({ success: true, data: { friends } });

      } catch (error) {
        console.error('Get friends error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to fetch friends' });
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
        console.error('Add friend error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
