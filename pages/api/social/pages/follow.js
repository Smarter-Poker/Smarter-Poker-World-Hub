/**
 * Social Page Follow API
 *
 * POST /api/social/pages/follow  - Follow/unfollow a page
 * GET  /api/social/pages/follow  - Get followers for a page or user's followed pages
 * PUT  /api/social/pages/follow  - Update follower preferences (notifications, role)
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../../src/lib/auth-middleware';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


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
 * Reverse bridge: sync social page follow/unfollow to venue page_followers.
 * Best-effort (silent failure) — same pattern as forward bridge in /api/poker/follow.js.
 */
async function syncToVenueFollowers(userId, pageId, action) {
    try {
        const { data: pageData } = await getSupabase()
            .from('social_pages')
            .select('linked_venue_id')
            .eq('id', pageId)
            .maybeSingle();

        const venueId = pageData?.linked_venue_id;
        if (!venueId) return;

        if (action === 'follow') {
            // Upsert into page_followers (venue follow system)
            const { data: existing } = await getSupabase()
                .from('page_followers')
                .select('id')
                .eq('user_id', userId)
                .eq('page_type', 'venue')
                .eq('page_id', String(venueId))
                .maybeSingle();
            if (!existing) {
                const { error: err_page_followers_uf1xf } = await getSupabase()
                  .from('page_followers')
                  .insert({ user_id: userId, page_type: 'venue', page_id: String(venueId) });
                if (err_page_followers_uf1xf) console.warn('[Supabase] Silent mutation failed in page_followers:', err_page_followers_uf1xf.message);
            }
        } else {
            const { error: err_page_followers_xl1cv } = await getSupabase()
              .from('page_followers')
              .delete()
                .eq('user_id', userId)
                .eq('page_type', 'venue')
                .eq('page_id', String(venueId));
            if (err_page_followers_xl1cv) console.warn('[Supabase] Silent mutation failed in page_followers:', err_page_followers_xl1cv.message);
        }
    } catch (e) {
        console.warn('[Social Follow] Venue cross-sync error:', e.message);
    }
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }


      if (req.method === 'POST') {
          // Require JWT auth for follow/unfollow
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          let { page_id, action, follower_id, slug } = req.body;
          const user_id = authUser.id;

          if (!page_id && !slug) {
              return res.status(400).json({ success: false, error: 'page_id or slug required' });
          }

          if (!page_id && slug) {
              const { data: pageLookup } = await getSupabase()
                  .from('social_pages')
                  .select('id')
                  .eq('slug', slug)
                  .maybeSingle();
              
              if (!pageLookup?.id) {
                  return res.status(404).json({ success: false, error: 'Social page not found' });
              }
              page_id = pageLookup.id;
          }

          // === Approve/Reject (Commander actions) ===
          if (action === 'approve' || action === 'reject') {
              if (!follower_id) return res.status(400).json({ success: false, error: 'follower_id required' });
              // Verify requester is the page owner
              const { data: ownerCheck } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', page_id).maybeSingle();
              if (!ownerCheck || ownerCheck.owner_id !== user_id) {
                  return res.status(403).json({ success: false, error: 'Only page owner can approve/reject followers' });
              }
              if (action === 'approve') {
                  const { data, error } = await getSupabase()
                      .from('social_page_followers')
                      .update({ status: 'approved' })
                      .eq('page_id', page_id)
                      .eq('user_id', follower_id)
                      .select().maybeSingle();
                  if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
                  return res.status(200).json({ success: true, data });
              } else {
                  const { error } = await getSupabase()
                      .from('social_page_followers')
                      .delete()
                      .eq('page_id', page_id)
                      .eq('user_id', follower_id);
                  if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
                  return res.status(200).json({ success: true });
              }
          }

          if (action === 'unfollow') {
              const { error } = await getSupabase()
                  .from('social_page_followers')
                  .delete()
                  .eq('page_id', page_id)
                  .eq('user_id', user_id);

              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
              // Reverse bridge: sync unfollow to venue system
              syncToVenueFollowers(user_id, page_id, 'unfollow');
              return res.status(200).json({ success: true, following: false });
          }

          // Determine if page requires approval (home_game type)
          let requiresApproval = false;
          const { data: pageData } = await getSupabase()
              .from('social_pages').select('metadata').eq('id', page_id).maybeSingle();
          if (pageData?.metadata?.page_type === 'home_game') {
              requiresApproval = true;
          }

          const followStatus = requiresApproval ? 'pending' : 'approved';

          // Follow
          const { data, error } = await getSupabase()
              .from('social_page_followers')
              .upsert({
                  page_id,
                  user_id,
                  role: 'follower',
                  status: followStatus,
                  notifications_enabled: true
              }, { onConflict: 'page_id,user_id' })
              .select()
              .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

          // Send push notification to page owner about new follower
          try {
              const { data: ownerPage } = await getSupabase()
                  .from('social_pages').select('owner_id, name').eq('id', page_id).maybeSingle();
              if (ownerPage && ownerPage.owner_id !== user_id) {
                  const { data: followerProfile } = await getSupabase()
                      .from('profiles').select('username, full_name').eq('id', user_id).maybeSingle();
                  const followerName = followerProfile?.username || followerProfile?.full_name || 'Someone';
                  const notifTitle = requiresApproval ? '🔔 New Follow Request' : '🎉 New Follower';
                  const notifMsg = requiresApproval
                      ? `${followerName} wants to follow your page "${ownerPage.name}". Approve or reject in your Live Games tab.`
                      : `${followerName} is now following your page "${ownerPage.name}"!`;
                  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/notifications/send`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '' },
                      body: JSON.stringify({
                          title: notifTitle,
                          message: notifMsg,
                          externalUserIds: [ownerPage.owner_id],
                          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/social-media`,
                          data: { type: 'follow_request', page_id, follower_id: user_id }
                      }),
                  });
              }
          } catch (notifErr) { console.warn('Follow notification error:', notifErr); }

          // Reverse bridge: sync follow to venue system
          syncToVenueFollowers(user_id, page_id, 'follow');

          return res.status(201).json({ success: true, following: true, status: followStatus, pending: requiresApproval, data });

      } else if (req.method === 'GET') {
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const page_id = safeQ(req.query.page_id);
          const user_id = safeQ(req.query.user_id);
          const role = safeQ(req.query.role);
          const requester_id = safeQ(req.query.requester_id);

          if (page_id) {
              // Get followers for a page
              let query = getSupabase()
                  .from('social_page_followers')
                  .select('id, user_id, role, status, notifications_enabled, created_at')
                  .eq('page_id', page_id)
                      .limit(100);

              if (role) query = query.eq('role', role);

              const { data, error } = await query.order('created_at', { ascending: false })
                  .limit(100);
              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

              // Determine if requester is page owner
              const { data: pageInfo } = await getSupabase()
                  .from('social_pages').select('owner_id, is_public').eq('id', page_id).maybeSingle();
              const isOwner = requester_id && pageInfo && pageInfo.owner_id === requester_id;
              const isPublicPage = pageInfo?.is_public !== false; // default to public

              // For public pages OR owner: return enriched member profiles
              if (isOwner || isPublicPage) {
                  const approvedFollowers = (data || []).filter(f => f.status === 'approved');
                  const userIds = approvedFollowers.map(f => f.user_id);
                  let profiles = {};
                  if (userIds.length > 0) {
                      const { data: profileData } = await getSupabase()
                          .from('profiles')
                          .select('id, username, full_name, avatar_url')
                          .in('id', userIds)
                              .limit(100);
                      (profileData || []).forEach(p => { profiles[p.id] = p; });
                  }
                  const enriched = approvedFollowers.map(f => ({
                      ...f,
                      profile: profiles[f.user_id] || null
                  }));
                  const myFollow = requester_id ? (data || []).find(f => f.user_id === requester_id) : null;
                  return res.status(200).json({
                      success: true,
                      data: enriched,
                      count: enriched.length,
                      is_following: !!myFollow,
                      my_status: myFollow ? myFollow.status : null
                  });
              } else {
                  // Private pages: non-owners only see the count + their own follow status
                  const myFollow = requester_id ? (data || []).find(f => f.user_id === requester_id) : null;
                  return res.status(200).json({
                      success: true,
                      count: (data || []).filter(f => f.status === 'approved').length,
                      my_status: myFollow ? myFollow.status : null,
                      is_following: !!myFollow,
                  });
              }
          }

          if (user_id) {
              // Get pages a user follows
              const { data, error } = await getSupabase()
                  .from('social_page_followers')
                  .select('page_id, role, created_at')
                  .eq('user_id', user_id)
                      .limit(100);

              if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

              // Get page details
              const pageIds = (data || []).map(f => f.page_id);
              let pages = {};
              if (pageIds.length > 0) {
                  const { data: pageData } = await getSupabase()
                      .from('social_pages')
                      .select('*')
                      .in('id', pageIds)
                          .limit(100);
                  (pageData || []).forEach(p => { pages[p.id] = p; });
              }

              const enriched = (data || []).map(f => ({
                  ...f,
                  page: pages[f.page_id] || null
              }));

              return res.status(200).json({ success: true, data: enriched });
          }

          return res.status(400).json({ success: false, error: 'page_id or user_id required' });

      } else if (req.method === 'PUT') {
          // Update follower preferences (notifications, role)
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { page_id, notify, role } = req.body;
          const user_id = authUser.id;

          if (!page_id) {
              return res.status(400).json({ success: false, error: 'page_id required' });
          }

          const updates = { updated_at: new Date().toISOString() };
          if (notify !== undefined) updates.notifications_enabled = !!notify;
          if (role && ['follower', 'moderator', 'admin'].includes(role)) {
              // Verify requester is page owner before allowing role change
              const { data: pageInfo } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', page_id).maybeSingle();
              if (pageInfo?.owner_id !== user_id) {
                  return res.status(403).json({ success: false, error: 'Only page owners can change member roles' });
              }
              updates.role = role;
          }

          const { data, error } = await getSupabase()
              .from('social_page_followers')
              .update(updates)
              .eq('page_id', page_id)
              .eq('user_id', notify !== undefined ? user_id : req.body.follower_id || user_id)
              .select()
              .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
          return res.status(200).json({ success: true, data });

      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
