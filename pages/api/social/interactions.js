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
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const post_id = safeQ(req.query.post_id);
          const type = safeQ(req.query.type);

          if (!post_id) {
              return res.status(400).json({ success: false, error: 'post_id required' });
          }
          // Public CDN cache: interaction counts are safe to cache 30s.
          // Optimistic UI handles real-time state; CDN serves the background sync.
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

          let query = getSupabase()
              .from('social_interactions')
              .select('id, post_id, user_id, interaction_type, created_at')
              .eq('post_id', post_id);

          if (type) {
              query = query.eq('interaction_type', type);
          }

          const { data, error } = await query
              .order('created_at', { ascending: false })
              .limit(200);

          if (error) {
              return res.status(500).json({ success: false, error: 'Internal server error' });
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
                          .limit(200);

                  if (commentError && commentError.code === '42P01') {
                      // Table doesn't exist - use comment interactions instead
                      const commentInteractions = (data || []).filter(i => i.interaction_type === 'comment');
                      comments = commentInteractions;
                  } else if (commentData) {
                      // Enrich comments with user info
                      const userIds = [...new Set((commentData || []).map(c => c.author_id))];
                      if (userIds.length > 0) {
                          const { data: profiles } = await getSupabase()
                              .from('profiles')
                              .select('id, username, full_name, avatar_url')
                              .in('id', userIds);

                          const profileMap = {};
                          (profiles || []).forEach(p => { profileMap[p.id] = p; });

                          comments = (commentData || []).map(c => ({
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

          // Read stored counts — check social_reels first, then social_posts
          let like_count = 0, share_count = 0, comment_count = 0;
          try {
              // Try social_reels first
              const { data: reelCounts } = await getSupabase()
                  .from('social_reels')
                  .select('like_count, share_count, comment_count')
                  .eq('id', post_id)
                  .maybeSingle();
              if (reelCounts) {
                  like_count = reelCounts.like_count || 0;
                  share_count = reelCounts.share_count || 0;
                  comment_count = reelCounts.comment_count || 0;
              } else {
                  // Fall back to social_posts
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

          // Validate post exists — check BOTH social_posts AND social_reels
          // Native reels have IDs in social_reels, not social_posts
          let postSource = null;
          const { data: postExists } = await getSupabase()
              .from('social_posts')
              .select('id')
              .eq('id', post_id)
              .maybeSingle();
          if (postExists) {
              postSource = 'posts';
          } else {
              const { data: reelExists } = await getSupabase()
                  .from('social_reels')
                  .select('id')
                  .eq('id', post_id)
                  .maybeSingle();
              if (reelExists) postSource = 'reels';
          }
          if (!postSource) {
              return res.status(404).json({ success: false, error: 'Post not found' });
          }

          // Helper: atomically increment/decrement the correct table
          const atomicIncrement = async (field, delta) => {
              try {
                  if (postSource === 'reels') {
                      const rpc = delta > 0 ? 'increment_reel_count' : 'decrement_reel_count';
                      const { error: rpcErr } = await getSupabase().rpc(rpc, { p_reel_id: post_id, p_field: field });
                      if (rpcErr) console.warn('[Interactions] Reel count RPC failed:', rpcErr.message);
                  } else {
                      const rpc = delta > 0 ? 'increment_post_count' : 'decrement_post_count';
                      const { error: rpcErr } = await getSupabase().rpc(rpc, { p_post_id: post_id, p_field: field });
                      if (rpcErr) console.warn('[Interactions] Post count RPC failed:', rpcErr.message);
                  }
              } catch (e) {
                  console.warn('[Interactions] Atomic counter failed:', e.message);
              }
          };

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
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }

              if (!data) return res.status(500).json({ success: false, error: 'Failed to create comment' });

              // Note: comment_count is updated atomically by DB trigger
              // (trig_update_post_comment_count / trig_update_reel_comment_count)
              // Calling atomicIncrement here would double-count.

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
                      const { data: deletedRows } = await getSupabase()
                          .from('social_interactions')
                          .delete()
                          .eq('id', existing.id)
                          .select('id');
                      if (deletedRows?.length > 0) {
                          await atomicIncrement('like_count', -1);
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
                  if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
                  await atomicIncrement('like_count', 1);
                  return res.status(201).json({ action: 'reacted', reacted: true });
              }

          } else if (interaction_type === 'share') {
              // Record share (prevent infinite increments on rapid clicks)
              const { error } = await getSupabase()
                  .from('social_interactions')
                  .insert({ post_id, user_id, interaction_type: 'share' });
                  
              if (error) {
                  // If it's a unique constraint violation (already shared), just return success without incrementing
                  if (error.code === '23505') return res.status(201).json({ action: 'shared' });
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }
              
              // Atomic increment share count on the correct table only if actually inserted
              await atomicIncrement('share_count', 1);
              return res.status(201).json({ action: 'shared' });
          }

          return res.status(400).json({ success: false, error: 'Invalid interaction_type' });

      } else if (req.method === 'DELETE') {
          // Require JWT auth for deleting interactions
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const post_id = safeQ(req.query.post_id);
          const interaction_type = safeQ(req.query.interaction_type);
          const user_id = authUser.id;

          if (!post_id) {
              return res.status(400).json({ success: false, error: 'post_id required' });
          }

          let deleteQuery = getSupabase()
              .from('social_interactions')
              .delete()
              .eq('post_id', post_id)
              .eq('user_id', user_id)
              .select('interaction_type');

          if (interaction_type) {
              deleteQuery = deleteQuery.eq('interaction_type', interaction_type);
          }

          // Execute the delete
          const { data: deletedRows, error: deleteError } = await deleteQuery;
          if (deleteError) return res.status(500).json({ success: false, error: 'Internal server error' });

          // Detect whether this post_id belongs to social_reels or social_posts
          let deleteSource = 'posts';
          const { data: reelCheck } = await getSupabase()
              .from('social_reels')
              .select('id')
              .eq('id', post_id)
              .maybeSingle();
          if (reelCheck) deleteSource = 'reels';


           // Decrement counts using atomic RPCs for deleted interactions
          if (deletedRows && deletedRows.length > 0) {
              const reactionTypes = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);
              const reactionsRemoved = deletedRows.filter(i => reactionTypes.has(i.interaction_type)).length;
              const sharesRemoved = deletedRows.filter(i => i.interaction_type === 'share').length;

              const atomicDecrement = async (field) => {
                  try {
                      // RPC errors do NOT throw — the prior catch only caught
                      // network exceptions. Capture explicitly so a counter
                      // drift logs instead of silently going stale.
                      const { error: decErr } = deleteSource === 'reels'
                          ? await getSupabase().rpc('decrement_reel_count', { p_reel_id: post_id, p_field: field })
                          : await getSupabase().rpc('decrement_post_count', { p_post_id: post_id, p_field: field });
                      if (decErr) {
                          console.warn('[Interactions] DELETE decrement RPC error (counter may drift):', field, decErr?.message || decErr);
                      }
                  } catch (e) {
                      console.warn('[Interactions] DELETE decrement threw:', e.message);
                  }
              };

              const decrements = [];
              for (let i = 0; i < reactionsRemoved; i++) decrements.push(atomicDecrement('like_count'));
              for (let i = 0; i < sharesRemoved; i++) decrements.push(atomicDecrement('share_count'));
              await Promise.all(decrements);
          }

          return res.status(200).json({ success: true });


      } else {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
