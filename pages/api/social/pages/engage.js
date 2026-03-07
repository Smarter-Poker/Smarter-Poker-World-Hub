/**
 * Social Page Post Engagement API - Likes and Comments
 *
 * POST /api/social/pages/engage  - Like/unlike or comment on a post
 * GET  /api/social/pages/engage  - Get comments for a post
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
        // Require JWT auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { action, post_id, content, parent_id } = req.body;
        const user_id = authUser.id;

        if (!post_id || !action) {
            return res.status(400).json({ success: false, error: 'action and post_id required' });
        }

        if (action === 'like') {
            // Toggle like
            const { data: existing } = await supabase
                .from('social_page_post_likes')
                .select('id')
                .eq('post_id', post_id)
                .eq('user_id', user_id)
                .maybeSingle();

            if (existing) {
                await supabase.from('social_page_post_likes').delete().eq('id', existing.id);
                return res.status(200).json({ success: true, liked: false });
            } else {
                await supabase.from('social_page_post_likes').insert({ post_id, user_id });
                return res.status(201).json({ success: true, liked: true });
            }
        }

        if (action === 'comment') {
            if (!content) {
                return res.status(400).json({ success: false, error: 'content required for comments' });
            }

            const { data, error } = await supabase
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
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .eq('id', user_id)
                .maybeSingle();

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

        const { data, error } = await supabase
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
            const { data: profileData } = await supabase
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
        const { id, user_id, type } = req.query;

        if (!id || !user_id) {
            return res.status(400).json({ success: false, error: 'id and user_id required' });
        }

        if (type === 'comment') {
            const { error } = await supabase
                .from('social_page_post_comments')
                .delete()
                .eq('id', id)
                .eq('user_id', user_id);
            if (error) return res.status(500).json({ success: false, error: error.message });
        } else {
            const { error } = await supabase
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
}
