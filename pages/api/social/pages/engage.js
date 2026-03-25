/**
 * Social Page Post Engagement API - Likes and Comments
 *
 * POST /api/social/pages/engage  - Like/unlike or comment on a post
 * GET  /api/social/pages/engage  - Get comments for a post
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../../src/lib/auth-middleware';

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

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }


      if (req.method === 'POST') {
          // Require JWT auth
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { action, post_id, content, parent_id } = req.body;
          const user_id = authUser.id;

          if (!post_id || !action) {
              return res.status(400).json({ success: false, error: 'action and post_id required' });
          }

          if (action === 'like') {
              // Toggle like
              const { data: existing } = await getSupabase()
                  .from('social_page_post_likes')
                  .select('id')
                  .eq('post_id', post_id)
                  .eq('user_id', user_id)
                  .maybeSingle();

              if (existing) {
                  const { error: delErr } = await getSupabase().from('social_page_post_likes').delete().eq('id', existing.id);
                  if (delErr) return res.status(500).json({ success: false, error: delErr.message });
                  return res.status(200).json({ success: true, liked: false });
              } else {
                  await getSupabase().from('social_page_post_likes').insert({ post_id, user_id });

                  // Like notification — notify post author
                  try {
                      const { data: postData } = await getSupabase()
                          .from('social_page_posts').select('author_id, page_id').eq('id', post_id).maybeSingle();
                      if (postData && postData.author_id !== user_id) {
                          const { data: likerProfile } = await getSupabase()
                              .from('profiles').select('full_name, username').eq('id', user_id).maybeSingle();
                          const { data: pageData } = await getSupabase()
                              .from('social_pages').select('name').eq('id', postData.page_id).maybeSingle();
                          const likerName = likerProfile?.full_name || likerProfile?.username || 'Someone';
                          const pageName = pageData?.name || 'a page';
                          fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/notifications/send`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '' },
                              body: JSON.stringify({
                                  title: 'New Like',
                                  message: `${likerName} liked your post in "${pageName}"`,
                                  externalUserIds: [postData.author_id],
                                  url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/social-pages/${postData.page_id}`,
                                  data: { type: 'page_like', page_id: postData.page_id, post_id },
                              }),
                          }).catch(() => {});
                      }
                  } catch (ne) { console.error('Like notification error:', ne); }

                  return res.status(201).json({ success: true, liked: true });
              }
          }

          if (action === 'comment') {
              if (!content) {
                  return res.status(400).json({ success: false, error: 'content required for comments' });
              }

              const { data, error } = await getSupabase()
                  .from('social_page_post_comments')
                  .insert({
                      post_id,
                      user_id,
                      content,
                      parent_id: parent_id || null
                  })
                  .select()
                  .maybeSingle();

              if (error) return res.status(500).json({ success: false, error: error.message });
              if (!data) return res.status(500).json({ success: false, error: 'Failed to create comment' });

              // Enrich with profile
              const { data: profile } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, avatar_url')
                  .eq('id', user_id)
                  .maybeSingle();

              // Send notification to page owner about the new comment
              try {
                  const { data: pd } = await getSupabase()
                      .from('social_page_posts').select('page_id').eq('id', post_id).maybeSingle();
                  if (pd) {
                      const { data: pg } = await getSupabase()
                          .from('social_pages').select('owner_id, name').eq('id', pd.page_id).maybeSingle();
                      if (pg && pg.owner_id !== user_id) {
                          const cn = profile?.full_name || profile?.username || 'Someone';
                          fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/notifications/send`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || '' },
                              body: JSON.stringify({ title: 'New Comment', message: `${cn} commented on a post in "${pg.name}"`, externalUserIds: [pg.owner_id], url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/hub/social-pages/${pd.page_id}`, data: { type: 'page_comment', page_id: pd.page_id, post_id } }),
                          }).catch(() => {});
                      }
                  }
              } catch (ne) { console.error('Comment notification error:', ne); }

              return res.status(201).json({
                  success: true,
                  data: { ...data, author: profile }
              });
          }

          return res.status(400).json({ success: false, error: 'Invalid action. Use "like" or "comment"' });

      } else if (req.method === 'GET') {
          const { post_id, limit = '50' } = req.query;

          if (!post_id) {
              return res.status(400).json({ success: false, error: 'post_id required' });
          }

          const { data, error } = await getSupabase()
              .from('social_page_post_comments')
              .select('*')
              .eq('post_id', post_id)
              .order('created_at', { ascending: true })
              .limit(parseInt(limit));

          if (error) return res.status(500).json({ success: false, error: error.message });

          // Enrich with profiles
          const userIds = [...new Set((data || []).map(c => c.user_id))];
          let profiles = {};
          if (userIds.length > 0) {
              const { data: profileData } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, avatar_url')
                  .in('id', userIds);
              (profileData || []).forEach(p => { profiles[p.id] = p; });
          }

          const enriched = (data || []).map(c => ({
              ...c,
              author: profiles[c.user_id] || null
          }));

          return res.status(200).json({ success: true, data: enriched });

      } else if (req.method === 'DELETE') {
          // Require JWT auth for deleting engagement
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { id, type } = req.query;
          const user_id = authUser.id;

          if (!id) {
              return res.status(400).json({ success: false, error: 'id required' });
          }

          if (type === 'comment') {
              const { error } = await getSupabase()
                  .from('social_page_post_comments')
                  .delete()
                  .eq('id', id)
                  .eq('user_id', user_id);
              if (error) return res.status(500).json({ success: false, error: error.message });
          } else {
              const { error } = await getSupabase()
                  .from('social_page_post_likes')
                  .delete()
                  .eq('id', id)
                  .eq('user_id', user_id);
              if (error) return res.status(500).json({ success: false, error: error.message });
          }

          return res.status(200).json({ success: true });

      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
