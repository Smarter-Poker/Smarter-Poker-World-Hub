/**
 * Social Page Follow API
 *
 * POST /api/social/pages/follow  - Follow/unfollow a page
 * GET  /api/social/pages/follow  - Get followers for a page or user's followed pages
 * PUT  /api/social/pages/follow  - Update follower preferences (notifications, role)
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { requireAuth, optionalAuth } from '../../../../src/lib/auth-middleware';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { homeGameFollowContext, publicHomeGameFollowPage } from '../../../../src/lib/home-games/socialFollowPrivacy.mjs';

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
          const pageResult = await getSupabase().from('social_pages')
              .select('id, owner_id, page_type, is_public, linked_entity_type, linked_entity_id').eq('id', page_id).maybeSingle();
          if (pageResult.error) throw pageResult.error;
          if (!pageResult.data) return res.status(404).json({ success: false, error: 'Social page not found' });
          const homeContext = await homeGameFollowContext(getSupabase(), pageResult.data, user_id);

          // === Approve/Reject (Commander actions) ===
          if (action === 'approve' || action === 'reject') {
              if (!follower_id) return res.status(400).json({ success: false, error: 'follower_id required' });
              if (homeContext.homeGame) {
                  if (!homeContext.staff) return res.status(403).json({ success: false, error: 'Only approved Home Game staff can moderate followers' });
                  if (action === 'approve') {
                      const targetContext = await homeGameFollowContext(getSupabase(), pageResult.data, follower_id);
                      if (!targetContext.approved) return res.status(403).json({ success: false, error: 'Approve this player in Commander before approving their page follow' });
                  }
              }
              // Verify requester is the page owner
              const { data: ownerCheck } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', page_id).maybeSingle();
              if (!homeContext.homeGame && (!ownerCheck || ownerCheck.owner_id !== user_id)) {
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
          if (homeContext.homeGame && (!homeContext.active || homeContext.denied)) {
              return res.status(403).json({ success: false, error: 'This Home Game is not accepting your follow request' });
          }

          // Determine if page requires approval (home_game type)
          let requiresApproval = false;
          // 2026-08-15 audit: page_type is a top-level column (the metadata
          // read was always undefined, so home-game approval was bypassed).
          const { data: pageData } = await getSupabase()
              .from('social_pages').select('page_type, is_public, metadata').eq('id', page_id).maybeSingle();
          if (pageData?.page_type === 'home_game'
              || pageData?.metadata?.page_type === 'home_game'
              || pageData?.is_public === false) {
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
                      .from('profiles').select('username').eq('id', user_id).maybeSingle();
                  const followerName = followerProfile?.username || 'Someone';
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
          // Identity comes from the verified JWT only (rule 5). A
          // ?requester_id= query value is ignored: it let any caller claim
          // to be a private page's owner and read its member list. No token,
          // or an invalid one, means an anonymous caller.
          let requester_id = null;
          try {
              const requester = await optionalAuth(req, getSupabase());
              requester_id = requester?.id || null;
          } catch (_authErr) {
              requester_id = null;
          }

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
              const { data: pageInfo, error: pageInfoError } = await getSupabase()
                  .from('social_pages').select('id, owner_id, is_public, page_type, linked_entity_type, linked_entity_id').eq('id', page_id).maybeSingle();
              if (pageInfoError) throw pageInfoError;
              const homeContext = await homeGameFollowContext(getSupabase(), pageInfo, requester_id);
              const isOwner = homeContext.homeGame ? homeContext.staff : requester_id && pageInfo && pageInfo.owner_id === requester_id;
              const isPublicPage = homeContext.homeGame ? homeContext.public : pageInfo?.is_public !== false;
              if (homeContext.homeGame) res.setHeader('Cache-Control', 'private, no-store');

              // For public pages OR owner: return enriched member profiles
              if (isOwner || isPublicPage) {
                  const approvedFollowers = (data || []).filter(f => f.status === 'approved');
                  const userIds = approvedFollowers.map(f => f.user_id);
                  let profiles = {};
                  if (userIds.length > 0) {
                      const { data: profileData } = await getSupabase()
                          .from('profiles')
                          .select('id, username, display_name, avatar_url')
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
              // Get pages a user follows. The person themselves sees every
              // follow, pending ones included. Anyone else sees only approved
              // follows of public pages: membership of a private page, or a
              // request still waiting on its owner, is not a stranger's to read.
              const isSelf = requester_id === user_id;
              const { data, error } = await getSupabase()
                  .from('social_page_followers')
                  .select('page_id, role, status, created_at')
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

              let visible = isSelf
                  ? (data || [])
                  : (data || []).filter(f => f.status === 'approved'
                      && pages[f.page_id] && pages[f.page_id].is_public !== false);
              const contexts = new Map(await Promise.all(Object.values(pages).map(async page =>
                  [page.id, await homeGameFollowContext(getSupabase(), page, isSelf ? requester_id : null)])));
              visible = visible.filter(f => {
                  const context = contexts.get(f.page_id);
                  return !context?.homeGame || context.public || (isSelf && context.approved);
              });
              if ([...contexts.values()].some(context => context.homeGame)) res.setHeader('Cache-Control', 'private, no-store');
              const enriched = visible.map(({ status, ...f }) => ({
                  ...f,
                  ...(isSelf ? { status } : {}),
                  page: pages[f.page_id] ? publicHomeGameFollowPage(pages[f.page_id]) : null
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
          const homePage = await getSupabase().from('social_pages')
              .select('id, owner_id, page_type, is_public, linked_entity_type, linked_entity_id').eq('id', page_id).maybeSingle();
          if (homePage.error) throw homePage.error;
          const homeContext = await homeGameFollowContext(getSupabase(), homePage.data, user_id);
          if (homeContext.homeGame) {
              const targetUser = req.body.follower_id || user_id;
              if (notify !== undefined && targetUser !== user_id) return res.status(403).json({ success: false, error: 'Notification preferences can only be changed for yourself' });
              if (role) {
                  if (!homeContext.staff) return res.status(403).json({ success: false, error: 'Only approved Home Game staff can change follower roles' });
                  const targetContext = await homeGameFollowContext(getSupabase(), homePage.data, targetUser);
                  if (!targetContext.approved) return res.status(403).json({ success: false, error: 'Follower roles require approved Commander membership' });
              } else if (targetUser !== user_id) {
                  return res.status(403).json({ success: false, error: 'You cannot change another follower' });
              }
          }

          const updates = { updated_at: new Date().toISOString() };
          if (notify !== undefined) updates.notifications_enabled = !!notify;
          if (role && ['follower', 'moderator', 'admin'].includes(role)) {
              // Verify requester is page owner before allowing role change
              const { data: pageInfo } = await getSupabase()
                  .from('social_pages').select('owner_id').eq('id', page_id).maybeSingle();
              if (!homeContext.homeGame && pageInfo?.owner_id !== user_id) {
                  return res.status(403).json({ success: false, error: 'Only page owners can change member roles' });
              }
              updates.role = role;
          }

          const { data, error } = await getSupabase()
              .from('social_page_followers')
              .update(updates)
              .eq('page_id', page_id)
              // Target the member being changed when follower_id is supplied
              // (the old `notify !== undefined` discriminator made an owner's
              // role-change edit their OWN row instead of the member's).
              .eq('user_id', req.body.follower_id || user_id)
              .select()
              .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
          return res.status(200).json({ success: true, data });

      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
