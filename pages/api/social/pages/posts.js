/**
 * Social Page Posts API - Feed content for pages
 *
 * GET  /api/social/pages/posts?page_id=<id>  - Get posts for a page
 * POST /api/social/pages/posts               - Create post on a page
 * PUT  /api/social/pages/posts               - Update a post
 * DELETE /api/social/pages/posts?id=<id>     - Delete a post
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
        const { page_id, author_id, user_id, pinned_only, limit = '20', offset = '0' } = req.query;

        if (!page_id && !author_id) {
            return res.status(400).json({ error: 'page_id or author_id required' });
        }

        let query = supabase
            .from('social_page_posts')
            .select('*')
            .eq('is_approved', true);

        if (page_id) query = query.eq('page_id', page_id);
        if (author_id) query = query.eq('author_id', author_id);
        if (pinned_only === 'true') query = query.eq('is_pinned', true);

        // Pinned first, then by date
        query = query
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        // Enrich with author profiles
        const authorIds = [...new Set((data || []).map(p => p.author_id))];
        let profiles = {};
        if (authorIds.length > 0) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', authorIds);
            (profileData || []).forEach(p => { profiles[p.id] = p; });
        }

        // Check user likes
        let userLikes = new Set();
        if (user_id && data && data.length > 0) {
            const postIds = data.map(p => p.id);
            const { data: likes } = await supabase
                .from('social_page_post_likes')
                .select('post_id')
                .eq('user_id', user_id)
                .in('post_id', postIds);
            (likes || []).forEach(l => userLikes.add(l.post_id));
        }

        const enriched = (data || []).map(p => ({
            ...p,
            author: profiles[p.author_id] || null,
            user_liked: userLikes.has(p.id)
        }));

        return res.status(200).json({ success: true, data: enriched });

    } else if (req.method === 'POST') {
        // Require JWT auth for creating posts
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Authentication required' });
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });

        const { page_id, content, content_type, media_urls,
            link_preview, visibility, is_pinned, metadata } = req.body;
        const author_id = authUser.id;

        if (!page_id) {
            return res.status(400).json({ error: 'page_id required' });
        }

        if (!content && (!media_urls || media_urls.length === 0)) {
            return res.status(400).json({ error: 'Content or media required' });
        }

        // Check if page requires approval
        const { data: page } = await supabase
            .from('social_pages')
            .select('require_post_approval, owner_id, allow_member_posts, name, avatar_url, page_type')
            .eq('id', page_id)
            .single();

        if (!page) return res.status(404).json({ error: 'Page not found' });

        const isOwner = page.owner_id === author_id;

        // Check if user can post
        if (!isOwner && !page.allow_member_posts) {
            // Check if admin/moderator
            const { data: membership } = await supabase
                .from('social_page_followers')
                .select('role')
                .eq('page_id', page_id)
                .eq('user_id', author_id)
                .maybeSingle();

            if (!membership || !['admin', 'moderator', 'owner'].includes(membership.role)) {
                return res.status(403).json({ error: 'Only admins can post on this page' });
            }
        }

        const { data, error } = await supabase
            .from('social_page_posts')
            .insert({
                page_id,
                author_id,
                content: content || '',
                content_type: content_type || 'text',
                media_urls: media_urls || [],
                link_preview,
                visibility: visibility || 'public',
                is_pinned: isOwner ? (is_pinned || false) : false,
                is_approved: isOwner || !page.require_post_approval,
                metadata: metadata || {}
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        // Mirror to social_posts for global feed visibility (non-blocking)
        // Only mirror approved, public posts
        if (data && data.is_approved && (data.visibility === 'public' || !data.visibility)) {
            try {
                await supabase
                    .from('social_posts')
                    .insert({
                        author_id: page.owner_id,
                        content: data.content,
                        content_type: data.content_type || 'text',
                        media_urls: data.media_urls || [],
                        visibility: 'public',
                        // Copy link preview data to flat columns for global feed rendering
                        ...(data.link_preview ? {
                            link_url: data.link_preview.url || null,
                            link_title: data.link_preview.title || null,
                            link_description: data.link_preview.description || null,
                            link_image: data.link_preview.image || null,
                        } : {}),
                        metadata: {
                            ...(data.metadata || {}),
                            source: 'social_page_post',
                            source_page_id: page_id,
                            source_post_id: data.id,
                            page_name: page.name,
                            page_avatar_url: page.avatar_url,
                            page_type: page.page_type
                        }
                    });
                console.log(`[PagePosts] Mirrored post ${data.id} to global feed for page "${page.name}"`);
            } catch (mirrorErr) {
                console.error('[PagePosts] Failed to mirror post to global feed:', mirrorErr.message);
                // Non-fatal — page post was still created successfully
            }
        }

        return res.status(201).json({ success: true, data });

    } else if (req.method === 'PUT') {
        const { id, author_id, content, media_urls, link_preview, is_pinned, visibility } = req.body;

        if (!id || !author_id) {
            return res.status(400).json({ error: 'id and author_id required' });
        }

        // Verify ownership or admin status
        const { data: post } = await supabase
            .from('social_page_posts')
            .select('author_id, page_id')
            .eq('id', id)
            .single();

        if (!post) return res.status(404).json({ error: 'Post not found' });

        const isAuthor = post.author_id === author_id;

        // Always check page admin status (needed for pin permission)
        const { data: page } = await supabase
            .from('social_pages')
            .select('owner_id')
            .eq('id', post.page_id)
            .single();
        const isPageAdmin = page?.owner_id === author_id;

        if (!isAuthor && !isPageAdmin) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updates = { updated_at: new Date().toISOString() };
        if (content !== undefined) updates.content = content;
        if (media_urls !== undefined) updates.media_urls = media_urls;
        if (link_preview !== undefined) updates.link_preview = link_preview;
        if (is_pinned !== undefined && isPageAdmin) updates.is_pinned = is_pinned;
        if (visibility !== undefined) updates.visibility = visibility;

        const { data, error } = await supabase
            .from('social_page_posts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true, data });

    } else if (req.method === 'DELETE') {
        const { id, author_id } = req.query;

        if (!id) return res.status(400).json({ error: 'id required' });

        // Verify ownership
        const { data: post } = await supabase
            .from('social_page_posts')
            .select('author_id, page_id')
            .eq('id', id)
            .single();

        if (!post) return res.status(404).json({ error: 'Post not found' });

        const isAuthor = post.author_id === author_id;
        let isPageOwner = false;
        if (!isAuthor) {
            const { data: page } = await supabase
                .from('social_pages')
                .select('owner_id')
                .eq('id', post.page_id)
                .single();
            isPageOwner = page?.owner_id === author_id;
        }

        if (!isAuthor && !isPageOwner) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { error } = await supabase
            .from('social_page_posts')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ success: true });

    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
