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
              const reaction_type = req.body.reaction_type || 'like';
              // Toggle like
              const { data: existing } = await getSupabase()
                  .from('social_page_post_likes')
                  .select('id, reaction_type')
                  .eq('post_id', post_id)
                  .eq('user_id', user_id)
                  .maybeSingle();

              if (existing) {
                  // If same reaction, unlike. If different reaction, update.
                  if (existing.reaction_type === reaction_type) {
                      const { error: delErr } = await getSupabase().from('social_page_post_likes').delete().eq('id', existing.id);
                      if (delErr) return res.status(500).json({ success: false, error: delErr.message });
                      return res.status(200).json({ success: true, liked: false });
                  } else {
                      const { error: updErr } = await getSupabase().from('social_page_post_likes').update({ reaction_type }).eq('id', existing.id);
                      if (updErr) return res.status(500).json({ success: false, error: updErr.message });
                      return res.status(200).json({ success: true, liked: true, reaction_type });
                  }
              } else {
                  const { error: insErr } = await getSupabase().from('social_page_post_likes').insert({ post_id, user_id, reaction_type });
                  if (insErr) return res.status(500).json({ success: false, error: insErr.message });

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

                  return res.status(201).json({ success: true, liked: true, reaction_type });
              }
          }

          // Comment like toggle
          if (action === 'like_comment') {
              const { comment_id } = req.body;
              if (!comment_id) return res.status(400).json({ success: false, error: 'comment_id required' });

              const { data: existing } = await getSupabase()
                  .from('social_page_comment_likes')
                  .select('id')
                  .eq('comment_id', comment_id)
                  .eq('user_id', user_id)
                  .maybeSingle();

              if (existing) {
                  const { error: delErr } = await getSupabase().from('social_page_comment_likes').delete().eq('id', existing.id);
                  if (delErr) return res.status(500).json({ success: false, error: delErr.message });
                  return res.status(200).json({ success: true, liked: false });
              } else {
                  const { error: insErr } = await getSupabase().from('social_page_comment_likes').insert({ comment_id, user_id });
                  if (insErr) return res.status(500).json({ success: false, error: insErr.message });
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

          return res.status(400).json({ success: false, error: 'Invalid action. Use "like", "comment", or "like_comment"' });

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

          // Enrich with comment like counts + user's like state
          const commentIds = (data || []).map(c => c.id);
          let commentLikeCounts = {};
          let userCommentLikes = new Set();
          if (commentIds.length > 0) {
              // Get like counts per comment
              const { data: allCLikes } = await getSupabase()
                  .from('social_page_comment_likes')
                  .select('comment_id')
                  .in('comment_id', commentIds);
              (allCLikes || []).forEach(l => {
                  commentLikeCounts[l.comment_id] = (commentLikeCounts[l.comment_id] || 0) + 1;
              });
              // Check if requesting user liked each comment
              const reqUserId = req.query.user_id;
              if (reqUserId) {
                  const { data: userCLikes } = await getSupabase()
                      .from('social_page_comment_likes')
                      .select('comment_id')
                      .eq('user_id', reqUserId)
                      .in('comment_id', commentIds);
                  (userCLikes || []).forEach(l => userCommentLikes.add(l.comment_id));
              }
          }

          const enriched = (data || []).map(c => ({
              ...c,
              author: profiles[c.user_id] || null,
              comment_like_count: commentLikeCounts[c.id] || 0,
              user_liked_comment: userCommentLikes.has(c.id),
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
              // Check if user is comment author OR page owner
              const { data: commentData } = await getSupabase()
                  .from('social_page_post_comments')
                  .select('id, user_id, post_id')
                  .eq('id', id)
                  .maybeSingle();
              if (!commentData) return res.status(404).json({ success: false, error: 'Comment not found' });
              const isCommentAuthor = commentData.user_id === user_id;
              let isOwner = false;
              if (!isCommentAuthor) {
                  const { data: postData } = await getSupabase()
                      .from('social_page_posts').select('page_id').eq('id', commentData.post_id).maybeSingle();
                  if (postData) {
                      const { data: pageData } = await getSupabase()
                          .from('social_pages').select('owner_id').eq('id', postData.page_id).maybeSingle();
                      isOwner = pageData?.owner_id === user_id;
                  }
              }
              if (!isCommentAuthor && !isOwner) {
                  return res.status(403).json({ success: false, error: 'Not authorized to delete this comment' });
              }
              const { error } = await getSupabase()
                  .from('social_page_post_comments')
                  .delete()
                  .eq('id', id);
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
