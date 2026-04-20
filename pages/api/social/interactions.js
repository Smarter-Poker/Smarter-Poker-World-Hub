/**
 * Social Interactions API - Likes, Comments, Shares
 *
 * GET /api/social/interactions?post_id=<id>&type=<like|comment|share>
 * POST /api/social/interactions  { post_id, interaction_type, content? }
 * DELETE /api/social/interactions?post_id=<id>&user_id=<id>
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';


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
    if (req.method === 'POST' || req.method === 'DELETE') {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
      if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ success: false, error: 'Server configuration error' });
      }


      if (req.method === 'GET') {
          const { post_id, type } = req.query;

          if (!post_id) {
              return res.status(400).json({ success: false, error: 'post_id required' });
          }

          let query = getSupabase()
              .from('social_interactions')
              .select('id, post_id, user_id, interaction_type, created_at')
              .eq('post_id', post_id)
                  .limit(100);

          if (type) {
              query = query.eq('interaction_type', type)
                  .limit(100);
          }

          const { data, error } = await query.order('created_at', { ascending: false })
              .limit(100);

          if (error) {
              return res.status(500).json({ success: false, error: error.message });
          }

          // Get comments - social_comments table may not exist, fall back to interactions
          let comments = [];
          if (!type || type === 'comment') {
              try {
                  const { data: commentData, error: commentError } = await getSupabase()
                      .from('social_comments')
                      .select('id, post_id, author_id, content, created_at, parent_id')
                      .eq('post_id', post_id)
                      .order('created_at', { ascending: true })
                          .limit(100);

                  if (commentError && commentError.code === '42P01') {
                      // Table doesn't exist - use comment interactions instead
                      const commentInteractions = (data || []).filter(i => i.interaction_type === 'comment');
                      comments = commentInteractions;
                  } else if (commentData) {
                      // Enrich comments with user info
                      const userIds = [...new Set(commentData.map(c => c.author_id))];
                      if (userIds.length > 0) {
                          const { data: profiles } = await getSupabase()
                              .from('profiles')
                              .select('id, username, full_name, avatar_url')
                              .in('id', userIds)
                                  .limit(100);

                          const profileMap = {};
                          (profiles || []).forEach(p => { profileMap[p.id] = p; });

                          comments = commentData.map(c => ({
                              ...c,
                              author: profileMap[c.author_id] || { username: 'Unknown' }
                          }));
                      }
                  }
              } catch {
                  // Fallback: use comment interactions
                  comments = (data || []).filter(i => i.interaction_type === 'comment');
              }
          }

          // Read stored counts from social_posts for accuracy (not from limited query results)
          let like_count = 0, share_count = 0, comment_count = 0;
          try {
              const { data: postCounts } = await getSupabase()
                  .from('social_posts')
                  .select('like_count, share_count, comment_count')
                  .eq('id', post_id)
                  .maybeSingle();
              if (postCounts) {
                  like_count = postCounts.like_count || 0;
                  share_count = postCounts.share_count || 0;
                  comment_count = postCounts.comment_count || 0;
              }
          } catch {
              // Fallback to counting from query results if post lookup fails
              const reactionSet = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);
              like_count = (data || []).filter(i => reactionSet.has(i.interaction_type)).length;
              share_count = (data || []).filter(i => i.interaction_type === 'share').length;
              comment_count = comments.length;
          }

          return res.status(200).json({
              interactions: data || [],
              comments,
              like_count,
              share_count,
              comment_count
          });

      } else if (req.method === 'POST') {
          // Require JWT auth for social interactions
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { post_id, interaction_type, content } = req.body;
          const user_id = authUser.id;

          if (!post_id || !interaction_type) {
              return res.status(400).json({ success: false, error: 'post_id and interaction_type required' });
          }

          // Validate post exists before any interaction
          const { data: postExists } = await getSupabase()
              .from('social_posts')
              .select('id')
              .eq('id', post_id)
              .maybeSingle();
          if (!postExists) {
              return res.status(404).json({ success: false, error: 'Post not found' });
          }

          if (interaction_type === 'comment') {
              // Insert into social_comments table
              const { data, error } = await getSupabase()
                  .from('social_comments')
                  .insert({
                      post_id,
                      author_id: user_id,
                      content: content || '',
                      parent_id: req.body.parent_id || null
                  })
                  .select()
                  .maybeSingle();

              if (error) {
                  // If table doesn't exist, fall back to interactions table
                  if (error.code === '42P01') {
                      const { data: fallback, error: fbError } = await getSupabase()
                          .from('social_interactions')
                          .insert({ post_id, user_id, interaction_type: 'comment' })
                          .select()
                          .maybeSingle();
                      if (fbError || !fallback) return res.status(500).json({ success: false, error: fbError?.message || 'Failed to create comment' });
                      return res.status(201).json({ interaction: fallback });
                  }
                  return res.status(500).json({ success: false, error: error.message });
              }

              if (!data) return res.status(500).json({ success: false, error: 'Failed to create comment' });

              // Update comment count on post
              try {
                  const { error: rpcErr } = await getSupabase().rpc('increment_post_count', { p_post_id: post_id, p_field: 'comment_count' });
                  if (rpcErr) {
                      // RPC doesn't exist or failed — try direct update
                      const { data: p } = await getSupabase().from('social_posts').select('comment_count').eq('id', post_id).maybeSingle();
                      if (p) {
                          await getSupabase().from('social_posts').update({ comment_count: (p.comment_count || 0) + 1 }).eq('id', post_id);
                      }
                  }
              } catch (e) {
                  console.warn('[Interactions] Comment count update failed:', e.message);
              }

              return res.status(201).json({ comment: data });

          } else if (['like', 'love', 'haha', 'wow', 'sad', 'angry'].includes(interaction_type)) {
              // Toggle reaction — supports all 6 emoji reaction types
              // Check if user has ANY existing reaction on this post
              const { data: existing } = await getSupabase()
                  .from('social_interactions')
                  .select('id, interaction_type')
                  .eq('post_id', post_id)
                  .eq('user_id', user_id)
                  .in('interaction_type', ['like', 'love', 'haha', 'wow', 'sad', 'angry'])
                  .maybeSingle();

              if (existing) {
                  if (existing.interaction_type === interaction_type) {
                      // Same reaction — toggle OFF (remove)
                      await getSupabase().from('social_interactions').delete().eq('id', existing.id);

                      // Decrement like count
                      try {
                          const { error: rpcErr } = await getSupabase().rpc('decrement_post_count', { p_post_id: post_id, p_field: 'like_count' });
                          if (rpcErr) {
                              const { data: post } = await getSupabase().from('social_posts').select('like_count').eq('id', post_id).maybeSingle();
                              if (post) {
                                  await getSupabase().from('social_posts').update({ like_count: Math.max(0, (post.like_count || 1) - 1) }).eq('id', post_id);
                              }
                          }
                      } catch (e) {
                          console.warn('[Interactions] Like count decrement failed:', e.message);
                      }

                      return res.status(200).json({ action: 'unreacted', reacted: false });
                  } else {
                      // Different reaction — SWITCH type (no count change)
                      await getSupabase()
                          .from('social_interactions')
                          .update({ interaction_type })
                          .eq('id', existing.id);

                      return res.status(200).json({ action: 'switched', reacted: true, from: existing.interaction_type, to: interaction_type });
                  }
              } else {
                  // No existing reaction — INSERT new
                  const { error } = await getSupabase()
                      .from('social_interactions')
                      .insert({ post_id, user_id, interaction_type });

                  if (error) return res.status(500).json({ success: false, error: error.message });

                  // Increment like count
                  try {
                      const { error: rpcErr } = await getSupabase().rpc('increment_post_count', { p_post_id: post_id, p_field: 'like_count' });
                      if (rpcErr) {
                          const { data: post } = await getSupabase().from('social_posts').select('like_count').eq('id', post_id).maybeSingle();
                          if (post) {
                              await getSupabase().from('social_posts').update({ like_count: (post.like_count || 0) + 1 }).eq('id', post_id);
                          }
                      }
                  } catch (e) {
                      console.warn('[Interactions] Like count increment failed:', e.message);
                  }

                  return res.status(201).json({ action: 'reacted', reacted: true });
              }

          } else if (interaction_type === 'share') {
              // Record share
              const { error } = await getSupabase()
                  .from('social_interactions')
                  .upsert({ post_id, user_id, interaction_type: 'share' }, { onConflict: 'post_id,user_id,interaction_type' });

              if (error && error.code !== '23505') {
                  return res.status(500).json({ success: false, error: error.message });
              }

              // Atomic increment share count
              try {
                  const { error: rpcErr } = await getSupabase().rpc('increment_post_count', { p_post_id: post_id, p_field: 'share_count' });
                  if (rpcErr) {
                      const { data: post } = await getSupabase().from('social_posts').select('share_count').eq('id', post_id).maybeSingle();
                      if (post) {
                          await getSupabase().from('social_posts').update({ share_count: (post.share_count || 0) + 1 }).eq('id', post_id);
                      }
                  }
              } catch (e) {
                  console.warn('[Interactions] Share count increment failed:', e.message);
              }

              return res.status(201).json({ action: 'shared' });
          }

          return res.status(400).json({ success: false, error: 'Invalid interaction_type' });

      } else if (req.method === 'DELETE') {
          // Require JWT auth for deleting interactions
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { post_id, interaction_type } = req.query;
          const user_id = authUser.id;

          if (!post_id) {
              return res.status(400).json({ success: false, error: 'post_id required' });
          }

          // Count what we're about to delete so we can decrement counts
          let countQuery = getSupabase()
              .from('social_interactions')
              .select('interaction_type')
              .eq('post_id', post_id)
              .eq('user_id', user_id);
          if (interaction_type) countQuery = countQuery.eq('interaction_type', interaction_type);
          const { data: toDelete } = await countQuery;

          let deleteQuery = getSupabase()
              .from('social_interactions')
              .delete()
              .eq('post_id', post_id)
              .eq('user_id', user_id);

          if (interaction_type) {
              deleteQuery = deleteQuery.eq('interaction_type', interaction_type);
          }

          const { error } = await deleteQuery;
          if (error) return res.status(500).json({ success: false, error: error.message });

           // Decrement counts on social_posts for deleted interactions
          if (toDelete && toDelete.length > 0) {
              const reactionTypes = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);
              const reactionsRemoved = toDelete.filter(i => reactionTypes.has(i.interaction_type)).length;
              const sharesRemoved = toDelete.filter(i => i.interaction_type === 'share').length;
              try {
                  if (reactionsRemoved > 0) {
                      const { data: p } = await getSupabase().from('social_posts').select('like_count').eq('id', post_id).maybeSingle();
                      if (p) await getSupabase().from('social_posts').update({ like_count: Math.max(0, (p.like_count || 0) - reactionsRemoved) }).eq('id', post_id);
                  }
                  if (sharesRemoved > 0) {
                      const { data: p } = await getSupabase().from('social_posts').select('share_count').eq('id', post_id).maybeSingle();
                      if (p) await getSupabase().from('social_posts').update({ share_count: Math.max(0, (p.share_count || 0) - sharesRemoved) }).eq('id', post_id);
                  }
              } catch (e) {
                  console.warn('[Interactions] Count decrement on DELETE failed:', e.message);
              }
          }

          return res.status(200).json({ success: true });

      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
