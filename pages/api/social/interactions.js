/**
 * Social Interactions API - Likes, Comments, Shares
 *
 * GET /api/social/interactions?post_id=<id>&type=<like|comment|share>
 * POST /api/social/interactions  { post_id, interaction_type, content? }
 * DELETE /api/social/interactions?post_id=<id>&user_id=<id>
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'GET') {
        const { post_id, type } = req.query;

        if (!post_id) {
            return res.status(400).json({ error: 'post_id required' });
        }

        let query = supabase
            .from('social_interactions')
            .select('id, post_id, user_id, interaction_type, created_at')
            .eq('post_id', post_id);

        if (type) {
            query = query.eq('interaction_type', type);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Get comments from separate comments table if type is comment
        let comments = [];
        if (!type || type === 'comment') {
            const { data: commentData } = await supabase
                .from('social_comments')
                .select('id, post_id, user_id, content, created_at, parent_id')
                .eq('post_id', post_id)
                .order('created_at', { ascending: true });

            if (commentData) {
                // Enrich comments with user info
                const userIds = [...new Set(commentData.map(c => c.user_id))];
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', userIds);

                const profileMap = {};
                (profiles || []).forEach(p => { profileMap[p.id] = p; });

                comments = commentData.map(c => ({
                    ...c,
                    author: profileMap[c.user_id] || { username: 'Unknown' }
                }));
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
        const { post_id, user_id, interaction_type, content } = req.body;

        if (!post_id || !user_id || !interaction_type) {
            return res.status(400).json({ error: 'post_id, user_id, and interaction_type required' });
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
                .single();

            if (error) {
                // If table doesn't exist, fall back to interactions table
                if (error.code === '42P01') {
                    const { data: fallback, error: fbError } = await supabase
                        .from('social_interactions')
                        .upsert({ post_id, user_id, interaction_type: 'comment' }, { onConflict: 'post_id,user_id' })
                        .select()
                        .single();
                    if (fbError) return res.status(500).json({ error: fbError.message });
                    return res.status(201).json({ interaction: fallback });
                }
                return res.status(500).json({ error: error.message });
            }

            // Update comment count on post
            await supabase.rpc('increment_post_count', { p_post_id: post_id, p_field: 'comment_count' }).catch(() => {
                // If RPC doesn't exist, try direct update
                supabase.from('social_posts').select('comment_count').eq('id', post_id).single().then(({ data: p }) => {
                    supabase.from('social_posts').update({ comment_count: (p?.comment_count || 0) + 1 }).eq('id', post_id);
                });
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

                // Decrement like count
                const { data: p } = await supabase.from('social_posts').select('like_count').eq('id', post_id).single();
                await supabase.from('social_posts').update({ like_count: Math.max(0, (p?.like_count || 1) - 1) }).eq('id', post_id);

                return res.status(200).json({ action: 'unliked', liked: false });
            } else {
                // Like - insert
                const { error } = await supabase
                    .from('social_interactions')
                    .insert({ post_id, user_id, interaction_type: 'like' });

                if (error) return res.status(500).json({ error: error.message });

                // Increment like count
                const { data: p } = await supabase.from('social_posts').select('like_count').eq('id', post_id).single();
                await supabase.from('social_posts').update({ like_count: (p?.like_count || 0) + 1 }).eq('id', post_id);

                return res.status(201).json({ action: 'liked', liked: true });
            }

        } else if (interaction_type === 'share') {
            // Record share
            const { error } = await supabase
                .from('social_interactions')
                .upsert({ post_id, user_id, interaction_type: 'share' }, { onConflict: 'post_id,user_id' });

            if (error && error.code !== '23505') {
                return res.status(500).json({ error: error.message });
            }

            // Increment share count
            const { data: p } = await supabase.from('social_posts').select('share_count').eq('id', post_id).single();
            await supabase.from('social_posts').update({ share_count: (p?.share_count || 0) + 1 }).eq('id', post_id);

            return res.status(201).json({ action: 'shared' });
        }

        return res.status(400).json({ error: 'Invalid interaction_type' });

    } else if (req.method === 'DELETE') {
        const { post_id, user_id, interaction_type } = req.query;

        if (!post_id || !user_id) {
            return res.status(400).json({ error: 'post_id and user_id required' });
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
        if (error) return res.status(500).json({ error: error.message });

        return res.status(200).json({ success: true });

    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
