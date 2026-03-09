/**
 * Social Interactions API - Likes, Comments, Shares
 *
 * GET /api/social/interactions?post_id=<id>&type=<like|comment|share>
 * POST /api/social/interactions  { post_id, interaction_type, content? }
 * DELETE /api/social/interactions?post_id=<id>&user_id=<id>
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  if (req.method === 'POST' || req.method === 'DELETE') {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'GET') {
        const { post_id, type } = req.query;

        if (!post_id) {
            return res.status(400).json({ success: false, error: 'post_id required' });
        }

        let query = supabase
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
                const { data: commentData, error: commentError } = await supabase
                    .from('social_comments')
                    .select('id, post_id, user_id, content, created_at, parent_id')
                    .eq('post_id', post_id)
                    .order('created_at', { ascending: true })
                        .limit(100);

                if (commentError && commentError.code === '42P01') {
                    // Table doesn't exist - use comment interactions instead
                    const commentInteractions = (data || []).filter(i => i.interaction_type === 'comment');
                    comments = commentInteractions;
                } else if (commentData) {
                    // Enrich comments with user info
                    const userIds = [...new Set(commentData.map(c => c.user_id))];
                    if (userIds.length > 0) {
                        const { data: profiles } = await supabase
                            .from('profiles')
                            .select('id, username, full_name, avatar_url')
                            .in('id', userIds)
                                .limit(100);

                        const profileMap = {};
                        (profiles || []).forEach(p => { profileMap[p.id] = p; });

                        comments = commentData.map(c => ({
                            ...c,
                            author: profileMap[c.user_id] || { username: 'Unknown' }
                        }));
                    }
                }
            } catch {
                // Fallback: use comment interactions
                comments = (data || []).filter(i => i.interaction_type === 'comment');
            }
        }

        return res.status(200).json({
            interactions: data || [],
            comments,
            like_count: (data || []).filter(i => i.interaction_type === 'like').length,
            share_count: (data || []).filter(i => i.interaction_type === 'share').length,
            comment_count: comments.length
        });

    } else if (req.method === 'POST') {
        // Require JWT auth for social interactions
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { post_id, interaction_type, content } = req.body;
        const user_id = authUser.id;

        if (!post_id || !interaction_type) {
            return res.status(400).json({ success: false, error: 'post_id and interaction_type required' });
        }

        if (interaction_type === 'comment') {
            // Insert into social_comments table
            const { data, error } = await supabase
                .from('social_comments')
                .insert({
                    post_id,
                    user_id,
                    content: content || '',
                    parent_id: req.body.parent_id || null
                })
                .select()
                .maybeSingle();

            if (error) {
                // If table doesn't exist, fall back to interactions table
                if (error.code === '42P01') {
                    const { data: fallback, error: fbError } = await supabase
                        .from('social_interactions')
                        .upsert({ post_id, user_id, interaction_type: 'comment' }, { onConflict: 'post_id,user_id' })
                        .select()
                        .maybeSingle();
                    if (fbError || !fallback) return res.status(500).json({ success: false, error: fbError?.message || 'Failed to create comment' });
                    return res.status(201).json({ interaction: fallback });
                }
                return res.status(500).json({ success: false, error: error.message });
            }

            if (!data) return res.status(500).json({ success: false, error: 'Failed to create comment' });

            // Update comment count on post
            await supabase.rpc('increment_post_count', { p_post_id: post_id, p_field: 'comment_count' }).catch(async (err) => {
                // If RPC doesn't exist, try direct update
                if (err.code === '42883') {
                    try {
                        const { data: p } = await supabase.from('social_posts').select('comment_count').eq('id', post_id).maybeSingle();
                        if (p) {
                            await supabase.from('social_posts').update({ comment_count: (p.comment_count || 0) + 1 }).eq('id', post_id);
                        }
                    } catch (fallbackErr) {
                        console.warn('[Interactions] Fallback comment count update failed:', fallbackErr.message);
                    }
                } else {
                    console.warn('[Interactions] Comment count increment RPC failed:', err.message);
                }
            });

            return res.status(201).json({ comment: data });

        } else if (interaction_type === 'like') {
            // Toggle like - check if already liked
            const { data: existing } = await supabase
                .from('social_interactions')
                .select('id')
                .eq('post_id', post_id)
                .eq('user_id', user_id)
                .eq('interaction_type', 'like')
                .maybeSingle();

            if (existing) {
                // Unlike - delete
                await supabase.from('social_interactions').delete().eq('id', existing.id);

                // Atomic decrement like count
                await supabase.rpc('decrement_post_count', { p_post_id: post_id, p_field: 'like_count' }).catch(async () => {
                  try {
                    const { data: post } = await supabase.from('social_posts').select('like_count').eq('id', post_id).maybeSingle();
                    if (post) {
                      await supabase.from('social_posts').update({ like_count: Math.max(0, (post.like_count || 1) - 1) }).eq('id', post_id);
                    }
                  } catch (e) {
                    console.warn('[Interactions] Like count decrement fallback failed:', e.message);
                  }
                });

                return res.status(200).json({ action: 'unliked', liked: false });
            } else {
                // Like - insert
                const { error } = await supabase
                    .from('social_interactions')
                    .insert({ post_id, user_id, interaction_type: 'like' });

                if (error) return res.status(500).json({ success: false, error: error.message });

                // Atomic increment like count
                await supabase.rpc('increment_post_count', { p_post_id: post_id, p_field: 'like_count' }).catch(async () => {
                  try {
                    const { data: post } = await supabase.from('social_posts').select('like_count').eq('id', post_id).maybeSingle();
                    if (post) {
                      await supabase.from('social_posts').update({ like_count: (post.like_count || 0) + 1 }).eq('id', post_id);
                    }
                  } catch (e) {
                    console.warn('[Interactions] Like count increment fallback failed:', e.message);
                  }
                });

                return res.status(201).json({ action: 'liked', liked: true });
            }

        } else if (interaction_type === 'share') {
            // Record share
            const { error } = await supabase
                .from('social_interactions')
                .upsert({ post_id, user_id, interaction_type: 'share' }, { onConflict: 'post_id,user_id' });

            if (error && error.code !== '23505') {
                return res.status(500).json({ success: false, error: error.message });
            }

            // Atomic increment share count
            await supabase.rpc('increment_post_count', { p_post_id: post_id, p_field: 'share_count' }).catch(async () => {
              try {
                const { data: post } = await supabase.from('social_posts').select('share_count').eq('id', post_id).maybeSingle();
                if (post) {
                  await supabase.from('social_posts').update({ share_count: (post.share_count || 0) + 1 }).eq('id', post_id);
                }
              } catch (e) {
                console.warn('[Interactions] Share count increment fallback failed:', e.message);
              }
            });

            return res.status(201).json({ action: 'shared' });
        }

        return res.status(400).json({ success: false, error: 'Invalid interaction_type' });

    } else if (req.method === 'DELETE') {
        // Require JWT auth for deleting interactions
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { post_id, interaction_type } = req.query;
        const user_id = authUser.id;

        if (!post_id) {
            return res.status(400).json({ success: false, error: 'post_id required' });
        }

        let query = supabase
            .from('social_interactions')
            .delete()
            .eq('post_id', post_id)
            .eq('user_id', user_id);

        if (interaction_type) {
            query = query.eq('interaction_type', interaction_type);
        }

        const { error } = await query;
        if (error) return res.status(500).json({ success: false, error: error.message });

        return res.status(200).json({ success: true });

    } else {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
}
