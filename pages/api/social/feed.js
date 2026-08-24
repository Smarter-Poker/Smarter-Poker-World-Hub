/**
 * GET /api/social/feed
 * ─────────────────────────────────────────────────────────────────
 * Unified server-side feed endpoint — fully enriched posts in ONE
 * server-side round trip using raw HTTP fetch (no Supabase JS client).
 *
 * PERF NOTES:
 *   - Raw fetch to Supabase REST is ~2x faster than the JS client
 *   - Posts + profiles + likes fetched in parallel (Promise.all)
 *   - social_likes limited to 200 rows max to avoid slow embedded join
 *   - HTTP cache headers allow CDN-level caching (15s max-age)
 *
 * Query params:
 *   offset   - pagination offset (default: 0)
 *   limit    - page size (default: 20, max: 50)
 *   user_id  - current user ID (for likes & bookmarks)
 */

// NOTE: This handler uses Node.js Pages Router API (req.query, res.setHeader, res.status)
// and CANNOT run on Edge Runtime. Keep as Node.js runtime (no export const runtime = 'edge').

const getSupaConfig = () => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });


// Raw fetch wrapper — avoids Supabase JS client cold-start overhead (~300ms)
async function supaFetch(path, options = {}) {
    const { url, key } = getSupaConfig(); const res = await fetch(`${url}/rest/v1${path}`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
        ...options,
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase ${path}: HTTP ${res.status} — ${txt.slice(0, 200)}`);
    }
    return res.json();
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
        // 2026-08-15 audit: identity comes from the JWT, never from
        // ?user_id — the service-role enrichment below would otherwise leak
        // any user's like/bookmark state to any caller who passed their uuid.
        let userId = null;
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            try {
                const { getServerUserWithFallback } = await import('../../../src/lib/serverAuth');
                const { createClient } = await import('../../../src/lib/supabaseServerClient');
                const { url: au, key: ak } = getSupaConfig(); const authClient = createClient(au, ak);
                const { user: authUser } = await getServerUserWithFallback(req, authClient);
                userId = authUser?.id || null;
            } catch (e) {
                console.warn('[API/feed] auth resolve failed:', e?.message);
            }
        }

        // ── 1. Fetch posts (no embedded join — separate parallel queries are faster) ──
        const postsParams = new URLSearchParams({
            select: 'id,content,content_type,media_urls,thumbnail_url,like_count,comment_count,share_count,view_count,visibility,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name,metadata',
            or: '(visibility.eq.public,visibility.is.null)',
            order: 'created_at.desc',
            offset: String(offset),
            // Over-fetch one row so hasMore is exact on boundary pages
            limit: String(limit + 1),
        });
        // BUG-11 FIX: is_deleted filter must be a separate param with Supabase REST dot-filter syntax
        // Was: { 'is_deleted': 'eq.false' } — this sent key name literally as 'is_deleted' with no operator binding
        postsParams.set('select', 'id,content,content_type,media_urls,thumbnail_url,like_count,comment_count,share_count,view_count,visibility,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name,metadata,is_deleted');

        let rawPosts = await supaFetch(`/social_posts?${postsParams}`);
        let posts = Array.isArray(rawPosts) ? rawPosts.filter(p => p.is_deleted === false) : [];
        const hasMore = Array.isArray(posts) && posts.length > limit;
        if (hasMore) posts = posts.slice(0, limit);

        if (!posts || posts.length === 0) {
            res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
            return res.status(200).json({ posts: [], hasMore: false });
        }

        // ── 2. Parallel: profiles + likes for this page + bookmarks ──────────
        const postIds = posts.map(p => p.id);
        const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];

        const [profilesData, likesData, ownLikesData, bookmarksData] = await Promise.all([
            // Profiles for all authors on this page
            authorIds.length > 0
                ? supaFetch(`/profiles?id=in.(${authorIds.join(',')})&select=id,username,full_name,display_name,avatar_url`)
                : Promise.resolve([]),

            // Reaction flavor for posts on this page (display only — capped)
            postIds.length > 0
                ? supaFetch(`/social_likes?post_id=in.(${postIds.join(',')})&select=post_id,user_id,reaction_type&limit=500`)
                : Promise.resolve([]),

            // The caller's OWN like rows — authoritative for isLiked. The
            // capped page above misses the caller's row on popular posts,
            // which rendered hearts un-liked and made the next tap UN-like.
            userId && postIds.length > 0
                ? supaFetch(`/social_likes?user_id=eq.${userId}&post_id=in.(${postIds.join(',')})&select=post_id`)
                    .catch(() => [])
                : Promise.resolve([]),

            // Bookmarks (only if user logged in)
            userId && postIds.length > 0
                ? supaFetch(`/social_interactions?user_id=eq.${userId}&interaction_type=eq.bookmark&post_id=in.(${postIds.join(',')})&select=post_id`)
                    .catch(() => []) // Non-critical — don't fail if this errors
                : Promise.resolve([]),
        ]);

        // ── 3. Build lookup maps ─────────────────────────────────────────────
        const profileMap = {};
        (profilesData || []).forEach(p => { profileMap[p.id] = p; });

        // Group likes by post_id
        const likesByPost = {};
        (likesData || []).forEach(l => {
            if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
            likesByPost[l.post_id].push(l);
        });

        const bookmarkedIds = new Set((bookmarksData || []).map(b => b.post_id));
        const ownLikedIds = new Set((ownLikesData || []).map(l => l.post_id));

        // ── 4. Enrich posts ──────────────────────────────────────────────────
        const enrichedPosts = posts.map(p => {
            const likesArray = likesByPost[p.id] || [];
            const reactions = likesArray.map(l => l.reaction_type || 'like');
            const profile = profileMap[p.author_id];
            const meta = p.metadata || {};

            return {
                id: p.id,
                authorId: p.author_id,
                content: p.content,
                contentType: p.content_type,
                mediaUrls: p.media_urls || [],
                thumbnailUrl: p.thumbnail_url || null,
                thumbnail_url: p.thumbnail_url || null,
                likeCount: p.like_count || 0,  // Now accurate thanks to DB trigger
                commentCount: p.comment_count || 0,
                shareCount: p.share_count || 0,
                reactions,
                isLiked: ownLikedIds.has(p.id),
                isBookmarked: bookmarkedIds.has(p.id),
                viewCount: p.view_count || 0,
                visibility: p.visibility || 'public',
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

        // ── 5. Cache headers ─────────────────────────────────────────────────
        // Per-user data (isLiked, isBookmarked) → private cache only
        // Anon users → public CDN cacheable
        if (userId) {
            // BUG-12 FIX: add Vary: Authorization so CDN correctly separates per-user responses
            // Without this, a cached anon response could be returned to a logged-in user
            res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
            res.setHeader('Vary', 'Accept-Encoding, Authorization');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
            res.setHeader('Vary', 'Accept-Encoding');
        }

        return res.status(200).json({
            posts: enrichedPosts,
            hasMore,
            offset,
            limit,
        });

    } catch (err) {
        console.warn('[API/feed] Unhandled error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
