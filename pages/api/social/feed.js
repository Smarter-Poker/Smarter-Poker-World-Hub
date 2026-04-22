/**
 * GET /api/social/feed
 * ─────────────────────────────────────────────────────────────────
 * Unified server-side feed endpoint — returns fully enriched posts
 * (posts + author profiles + user's likes) in ONE round trip.
 *
 * Why server-side?
 *   - Eliminates 2 extra sequential client→Supabase fetches
 *   - Uses service role key → no RLS overhead, faster queries
 *   - Adds HTTP caching headers for CDN-level caching
 *   - Joins profiles in a single DB pass vs 3 client calls
 *
 * Query params:
 *   offset   - pagination offset (default: 0)
 *   limit    - page size (default: 20, max: 50)
 *   user_id  - current user ID (for likes & bookmarks)
 */

import { createClient } from '@supabase/supabase-js';

// Server-side client with service role for fast, RLS-bypassing reads
const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
        const userId = req.query.user_id || null;

        // ── 1. Fetch posts + embedded likes in ONE query ──────────────────
        const { data: posts, error: postsError } = await serviceSupabase
            .from('social_posts')
            .select(`
                id, content, content_type, media_urls,
                like_count, comment_count, share_count,
                created_at, author_id, visibility,
                link_url, link_title, link_description, link_image, link_site_name,
                metadata,
                social_likes(user_id, reaction_type)
            `)
            .or('visibility.eq.public,visibility.is.null')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (postsError) {
            console.error('[API/feed] Posts query error:', postsError);
            return res.status(500).json({ error: postsError.message });
        }

        if (!posts || posts.length === 0) {
            // Add cache headers even for empty responses
            res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
            return res.status(200).json({ posts: [], hasMore: false });
        }

        // ── 2. Batch-fetch author profiles in ONE query ───────────────────
        const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];
        const [profilesResult, bookmarksResult] = await Promise.allSettled([
            authorIds.length > 0
                ? serviceSupabase
                    .from('profiles')
                    .select('id, username, full_name, display_name, avatar_url')
                    .in('id', authorIds)
                : Promise.resolve({ data: [] }),

            userId
                ? serviceSupabase
                    .from('social_interactions')
                    .select('post_id')
                    .eq('user_id', userId)
                    .eq('interaction_type', 'bookmark')
                : Promise.resolve({ data: [] }),
        ]);

        // Build lookup maps
        const profileMap = {};
        if (profilesResult.status === 'fulfilled') {
            (profilesResult.value.data || []).forEach(p => { profileMap[p.id] = p; });
        }

        const bookmarkedIds = new Set();
        if (bookmarksResult.status === 'fulfilled') {
            (bookmarksResult.value.data || []).forEach(b => bookmarkedIds.add(b.post_id));
        }

        // ── 3. Enrich posts ───────────────────────────────────────────────
        const enrichedPosts = posts.map(p => {
            const likesArray = p.social_likes || [];
            const reactions = likesArray.map(l => l.reaction_type || 'like');
            const profile = profileMap[p.author_id];
            const meta = p.metadata || {};

            return {
                id: p.id,
                authorId: p.author_id,
                content: p.content,
                contentType: p.content_type,
                mediaUrls: p.media_urls || [],
                likeCount: Math.max(p.like_count || 0, reactions.length),
                commentCount: p.comment_count || 0,
                shareCount: p.share_count || 0,
                reactions,
                isLiked: userId ? likesArray.some(l => l.user_id === userId) : false,
                isBookmarked: bookmarkedIds.has(p.id),
                createdAt: p.created_at,
                link_url: p.link_url || null,
                link_title: p.link_title || null,
                link_description: p.link_description || null,
                link_image: p.link_image || null,
                link_site_name: p.link_site_name || null,
                metadata: meta,
                author: {
                    name: meta.page_name || profile?.display_name || profile?.full_name || profile?.username || 'Player',
                    username: profile?.username || null,
                    avatar: meta.page_avatar_url || profile?.avatar_url || null,
                },
            };
        });

        // ── 4. Return with aggressive caching headers ─────────────────────
        // max-age=15: CDN/browser caches for 15s
        // stale-while-revalidate=60: serve stale while refreshing for up to 60s
        res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
        res.setHeader('Vary', 'Accept-Encoding');

        return res.status(200).json({
            posts: enrichedPosts,
            hasMore: posts.length === limit,
            offset,
            limit,
        });

    } catch (err) {
        console.error('[API/feed] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
