/**
 * /api/social/* — Hono catch-all router (Phase 4.4 module #19, 2026-04-28)
 *
 * Consolidates 10 social handlers under a single Hono app. The two upload
 * routes (upload.js + upload-comment-image.js) STAY as standalone files
 * because they use formidable for multipart parsing and need
 * `bodyParser: false` at the file level — Next.js routes static files
 * before catch-alls so they intercept their own URLs cleanly.
 *
 * Routes (mounted at /api/social):
 *   GET    /feed                    — public feed w/ raw-fetch perf trick
 *   GET    /interactions            — like/comment/share counts (public 30s cache)
 *   POST   /interactions            — react / comment / share (atomic counters)
 *   DELETE /interactions            — remove user's interactions on a post
 *   POST   /create-post             — RPC fn_create_social_post w/ direct-insert fallback
 *   POST   /auto-post               — system-generated profile/cover/bio update post
 *   GET    /crews                   — list user's crew memberships
 *   POST   /crews                   — create / join / leave crew (action dispatch)
 *   POST   /share-count             — atomic post/reel share-count increment
 *   POST   /upload-url              — presigned Supabase storage URL (TUS resumable)
 *   POST   /geocode-locations       — Nominatim → Google fallback geocode
 *   GET    /live-session            — friends/public/mine session lookup
 *   POST   /live-session            — start/update/end/chat (action dispatch)
 *   GET    /referral                — referral stats + code
 *   POST   /referral                — generate / apply referral code (action dispatch)
 *
 * Replaces 10 source files totalling 2034 LOC (excl. upload.js/upload-comment-image.js
 * which remain at 182 + 107 LOC).
 *
 * Auth: shared `getServerUserWithFallback` (post-4.1d ESM-clean) — equivalent to
 * the older `requireAuth()` and the direct GoTrue token-check pattern.
 *
 * /auto-post has a special dual-tier auth: x-internal-secret with CRON_SECRET
 * value (server-to-server) OR Bearer JWT.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ─── Cached Supabase service-role client ──────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Raw fetch wrapper used by /feed — avoids JS-client cold-start overhead
async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/social');

// Soft auth middleware — sets user if present, never 401s.
// Each route decides whether to require auth.
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const supabase = getSupabase();
  c.set('supabase', supabase);
  try {
    const { user } = await getServerUserWithFallback(req, supabase);
    c.set('user', user || null);
  } catch {
    c.set('user', null);
  }
  await next();
});

// ─── Middleware factories ────────────────────────────────────────────────
const requireUser = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Auth required' }, 401);
  await next();
};

const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

const uploadLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.upload)) {
    return c.body(null, 429);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /feed — public feed with raw-fetch perf trick + per-user enrichment
// ═══════════════════════════════════════════════════════════════════════════
app.get('/feed', async (c) => {
  try {
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
    const userId = c.req.query('user_id') || null;

    const postsParams = new URLSearchParams({
      select:
        'id,content,content_type,media_urls,like_count,comment_count,share_count,created_at,author_id,link_url,link_title,link_description,link_image,link_site_name,metadata',
      or: '(visibility.eq.public,visibility.is.null)',
      order: 'created_at.desc',
      offset: String(offset),
      limit: String(limit),
    });
    postsParams.append('is_deleted', 'eq.false');

    const posts = await supaFetch(`/social_posts?${postsParams}`);

    if (!posts || posts.length === 0) {
      c.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
      return c.json({ posts: [], hasMore: false });
    }

    const postIds = posts.map((p) => p.id);
    const authorIds = [...new Set(posts.map((p) => p.author_id).filter(Boolean))];

    const [profilesData, likesData, bookmarksData] = await Promise.all([
      authorIds.length > 0
        ? supaFetch(`/profiles?id=in.(${authorIds.join(',')})&select=id,username,full_name,display_name,avatar_url`)
        : Promise.resolve([]),
      postIds.length > 0
        ? supaFetch(`/social_likes?post_id=in.(${postIds.join(',')})&select=post_id,user_id,reaction_type&limit=500`)
        : Promise.resolve([]),
      userId && postIds.length > 0
        ? supaFetch(
            `/social_interactions?user_id=eq.${userId}&interaction_type=eq.bookmark&post_id=in.(${postIds.join(',')})&select=post_id`
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    const profileMap = {};
    (profilesData || []).forEach((p) => { profileMap[p.id] = p; });

    const likesByPost = {};
    (likesData || []).forEach((l) => {
      if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
      likesByPost[l.post_id].push(l);
    });

    const bookmarkedIds = new Set((bookmarksData || []).map((b) => b.post_id));

    const enrichedPosts = posts.map((p) => {
      const likesArray = likesByPost[p.id] || [];
      const reactions = likesArray.map((l) => l.reaction_type || 'like');
      const profile = profileMap[p.author_id];
      const meta = p.metadata || {};

      return {
        id: p.id,
        authorId: p.author_id,
        content: p.content,
        contentType: p.content_type,
        mediaUrls: p.media_urls || [],
        likeCount: p.like_count || 0,
        commentCount: p.comment_count || 0,
        shareCount: p.share_count || 0,
        reactions,
        isLiked: userId ? likesArray.some((l) => l.user_id === userId) : false,
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

    if (userId) {
      c.header('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
      c.header('Vary', 'Accept-Encoding, Authorization');
    } else {
      c.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
      c.header('Vary', 'Accept-Encoding');
    }

    return c.json({
      posts: enrichedPosts,
      hasMore: posts.length === limit,
      offset,
      limit,
    });
  } catch (err) {
    console.warn('[social/feed] Unhandled error:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET / POST / DELETE /interactions
// ═══════════════════════════════════════════════════════════════════════════
const safeQ = (v) => (v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v);
const REACTION_TYPES = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);

app.get('/interactions', async (c) => {
  const supabase = c.get('supabase');
  const post_id = safeQ(c.req.query('post_id'));
  const type = safeQ(c.req.query('type'));

  if (!post_id) return c.json({ success: false, error: 'post_id required' }, 400);

  c.header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  let query = supabase
    .from('social_interactions')
    .select('id, post_id, user_id, interaction_type, created_at')
    .eq('post_id', post_id);
  if (type) query = query.eq('interaction_type', type);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) return c.json({ success: false, error: 'Internal server error' }, 500);

  let comments = [];
  if (!type || type === 'comment') {
    try {
      const { data: commentData, error: commentError } = await supabase
        .from('social_comments')
        .select('id, post_id, author_id, content, created_at, parent_id')
        .eq('post_id', post_id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (commentError && commentError.code === '42P01') {
        comments = (data || []).filter((i) => i.interaction_type === 'comment');
      } else if (commentData) {
        const userIds = [...new Set((commentData || []).map((cm) => cm.author_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', userIds);
          const profileMap = {};
          (profiles || []).forEach((p) => { profileMap[p.id] = p; });
          comments = (commentData || []).map((cm) => ({
            ...cm,
            author: profileMap[cm.author_id] || { username: 'Unknown' },
          }));
        }
      }
    } catch {
      comments = (data || []).filter((i) => i.interaction_type === 'comment');
    }
  }

  let like_count = 0;
  let share_count = 0;
  let comment_count = 0;
  try {
    const { data: reelCounts } = await supabase
      .from('social_reels')
      .select('like_count, share_count, comment_count')
      .eq('id', post_id)
      .maybeSingle();
    if (reelCounts) {
      like_count = reelCounts.like_count || 0;
      share_count = reelCounts.share_count || 0;
      comment_count = reelCounts.comment_count || 0;
    } else {
      const { data: postCounts } = await supabase
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
    like_count = (data || []).filter((i) => REACTION_TYPES.has(i.interaction_type)).length;
    share_count = (data || []).filter((i) => i.interaction_type === 'share').length;
    comment_count = comments.length;
  }

  return c.json({ interactions: data || [], comments, like_count, share_count, comment_count });
});

app.post('/interactions', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { post_id, interaction_type, content, parent_id } = body;
  const user_id = user.id;

  if (!post_id || !interaction_type) {
    return c.json({ success: false, error: 'post_id and interaction_type required' }, 400);
  }

  // Determine post source
  let postSource = null;
  const { data: postExists } = await supabase
    .from('social_posts')
    .select('id')
    .eq('id', post_id)
    .maybeSingle();
  if (postExists) {
    postSource = 'posts';
  } else {
    const { data: reelExists } = await supabase
      .from('social_reels')
      .select('id')
      .eq('id', post_id)
      .maybeSingle();
    if (reelExists) postSource = 'reels';
  }
  if (!postSource) return c.json({ success: false, error: 'Post not found' }, 404);

  const atomicIncrement = async (field, delta) => {
    try {
      if (postSource === 'reels') {
        const rpc = delta > 0 ? 'increment_reel_count' : 'decrement_reel_count';
        const { error: rpcErr } = await supabase.rpc(rpc, { p_reel_id: post_id, p_field: field });
        if (rpcErr) console.warn('[social/interactions] reel RPC failed:', rpcErr.message);
      } else {
        const rpc = delta > 0 ? 'increment_post_count' : 'decrement_post_count';
        const { error: rpcErr } = await supabase.rpc(rpc, { p_post_id: post_id, p_field: field });
        if (rpcErr) console.warn('[social/interactions] post RPC failed:', rpcErr.message);
      }
    } catch (e) {
      console.warn('[social/interactions] atomic counter failed:', e.message);
    }
  };

  if (interaction_type === 'comment') {
    const { data, error } = await supabase
      .from('social_comments')
      .insert({
        post_id,
        author_id: user_id,
        content: content || '',
        parent_id: parent_id || null,
      })
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        const { data: fallback, error: fbError } = await supabase
          .from('social_interactions')
          .insert({ post_id, user_id, interaction_type: 'comment' })
          .select()
          .maybeSingle();
        if (fbError || !fallback) {
          return c.json({ success: false, error: fbError?.message || 'Failed to create comment' }, 500);
        }
        return c.json({ interaction: fallback }, 201);
      }
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    if (!data) return c.json({ success: false, error: 'Failed to create comment' }, 500);
    return c.json({ comment: data }, 201);
  }

  if (REACTION_TYPES.has(interaction_type)) {
    const { data: existing } = await supabase
      .from('social_interactions')
      .select('id, interaction_type')
      .eq('post_id', post_id)
      .eq('user_id', user_id)
      .in('interaction_type', [...REACTION_TYPES])
      .maybeSingle();

    if (existing) {
      if (existing.interaction_type === interaction_type) {
        await supabase.from('social_interactions').delete().eq('id', existing.id);
        await atomicIncrement('like_count', -1);
        return c.json({ action: 'unreacted', reacted: false });
      }
      await supabase
        .from('social_interactions')
        .update({ interaction_type })
        .eq('id', existing.id);
      return c.json({
        action: 'switched',
        reacted: true,
        from: existing.interaction_type,
        to: interaction_type,
      });
    }

    const { error } = await supabase
      .from('social_interactions')
      .insert({ post_id, user_id, interaction_type });
    if (error) return c.json({ success: false, error: 'Internal server error' }, 500);
    await atomicIncrement('like_count', 1);
    return c.json({ action: 'reacted', reacted: true }, 201);
  }

  if (interaction_type === 'share') {
    const { error } = await supabase
      .from('social_interactions')
      .upsert({ post_id, user_id, interaction_type: 'share' }, { onConflict: 'post_id,user_id,interaction_type' });
    if (error && error.code !== '23505') {
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }
    await atomicIncrement('share_count', 1);
    return c.json({ action: 'shared' }, 201);
  }

  return c.json({ success: false, error: 'Invalid interaction_type' }, 400);
});

app.delete('/interactions', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const post_id = safeQ(c.req.query('post_id'));
  const interaction_type = safeQ(c.req.query('interaction_type'));
  const user_id = user.id;

  if (!post_id) return c.json({ success: false, error: 'post_id required' }, 400);

  let countQuery = supabase
    .from('social_interactions')
    .select('interaction_type')
    .eq('post_id', post_id)
    .eq('user_id', user_id);
  if (interaction_type) countQuery = countQuery.eq('interaction_type', interaction_type);
  const { data: toDelete } = await countQuery;

  let deleteQuery = supabase
    .from('social_interactions')
    .delete()
    .eq('post_id', post_id)
    .eq('user_id', user_id);
  if (interaction_type) deleteQuery = deleteQuery.eq('interaction_type', interaction_type);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) return c.json({ success: false, error: 'Internal server error' }, 500);

  let deleteSource = 'posts';
  const { data: reelCheck } = await supabase
    .from('social_reels')
    .select('id')
    .eq('id', post_id)
    .maybeSingle();
  if (reelCheck) deleteSource = 'reels';

  if (toDelete && toDelete.length > 0) {
    const reactionsRemoved = toDelete.filter((i) => REACTION_TYPES.has(i.interaction_type)).length;
    const sharesRemoved = toDelete.filter((i) => i.interaction_type === 'share').length;

    const atomicDecrement = async (field) => {
      try {
        if (deleteSource === 'reels') {
          await supabase.rpc('decrement_reel_count', { p_reel_id: post_id, p_field: field });
        } else {
          await supabase.rpc('decrement_post_count', { p_post_id: post_id, p_field: field });
        }
      } catch (e) {
        console.warn('[social/interactions] DELETE decrement failed:', e.message);
      }
    };

    const decrements = [];
    for (let i = 0; i < reactionsRemoved; i++) decrements.push(atomicDecrement('like_count'));
    for (let i = 0; i < sharesRemoved; i++) decrements.push(atomicDecrement('share_count'));
    await Promise.all(decrements);
  }

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /create-post — RPC fn_create_social_post w/ direct-insert fallback
// ═══════════════════════════════════════════════════════════════════════════
app.post('/create-post', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { content, content_type = 'text', visibility = 'public', metadata, media_urls, thumbnail_url } = body;

  const hasContent = content && content.trim().length > 0;
  const hasMedia = Array.isArray(media_urls) && media_urls.length > 0;

  if (!hasContent && !hasMedia) {
    return c.json({ success: false, error: 'Content or media required' }, 400);
  }
  if (hasContent && content.length > 10000) {
    return c.json({ success: false, error: 'Content exceeds maximum length of 10,000 characters' }, 400);
  }
  if (hasMedia && media_urls.length > 10) {
    return c.json({ success: false, error: 'Maximum 10 media attachments allowed' }, 400);
  }

  let post = null;
  const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_create_social_post', {
    p_author_id: user.id,
    p_content: content?.trim() || '',
    p_content_type: content_type,
    p_media_urls: media_urls || [],
    p_visibility: visibility,
    p_achievement_data: metadata ? JSON.stringify(metadata) : null,
    p_thumbnail_url: thumbnail_url || null,
  });

  if (rpcError) {
    // IMPORTANT: keep this column list in sync with fn_create_social_post —
    // dropping a field here silently loses data on the fallback path.
    const { data: directPost, error: directError } = await supabase
      .from('social_posts')
      .insert({
        author_id: user.id,
        content: content?.trim() || '',
        content_type,
        media_urls: media_urls || [],
        visibility,
        metadata: metadata || null,
        thumbnail_url: thumbnail_url || null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (directError || !directPost) {
      console.warn('[social/create-post] error:', directError);
      return c.json({ success: false, error: 'Failed to create post' }, 500);
    }
    post = directPost;
  } else {
    if (!rpcResult) {
      console.warn('[social/create-post] RPC returned null');
      return c.json({ success: false, error: 'Failed to create post' }, 500);
    }
    post = rpcResult;
  }

  return c.json({ success: true, data: { post_id: post.id } });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /auto-post — server-to-server (CRON_SECRET) OR Bearer JWT
// ═══════════════════════════════════════════════════════════════════════════
const POST_TEMPLATES = {
  profile_pic_update: (name) => `${name} updated their profile picture.`,
  cover_photo_update: (name) => `${name} updated their cover photo.`,
  story_update: (name) => `${name} updated their bio.`,
  location_update: (name, location) => `${name} updated their location to ${location}.`,
};

app.post('/auto-post', writeLimit, async (c) => {
  const supabase = c.get('supabase');

  const internalSecret = c.req.header('x-internal-secret');
  let verifiedUserId = null;

  if (internalSecret && internalSecret === process.env.CRON_SECRET) {
    // Internal call — body must include user_id, validated against profiles.
    const body = await c.req.json().catch(() => ({}));
    const rawUserId = body.user_id;
    if (!rawUserId) {
      return c.json({ success: false, error: 'user_id required for internal calls' }, 400);
    }
    const { data: profileCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', rawUserId)
      .maybeSingle();
    if (!profileCheck) {
      return c.json({ success: false, error: 'Invalid user_id: profile not found' }, 403);
    }
    verifiedUserId = rawUserId;
    return continueAutoPost(c, body, verifiedUserId);
  }

  // Otherwise require Bearer JWT
  const user = c.get('user');
  if (!user) return c.json({ success: false, error: 'Authentication required' }, 401);
  verifiedUserId = user.id;

  const body = await c.req.json().catch(() => ({}));
  return continueAutoPost(c, body, verifiedUserId);
});

async function continueAutoPost(c, body, user_id) {
  const supabase = c.get('supabase');
  const { post_type, media_url, entity_name, entity_type, page_id, location } = body;

  if (!user_id || !post_type || !entity_name) {
    return c.json(
      { success: false, error: 'user_id, post_type, and entity_name are required' },
      400
    );
  }

  if (!POST_TEMPLATES[post_type]) {
    return c.json(
      {
        success: false,
        error: `Invalid post_type: ${post_type}. Valid: ${Object.keys(POST_TEMPLATES).join(', ')}`,
      },
      400
    );
  }

  const content = post_type === 'location_update'
    ? POST_TEMPLATES[post_type](entity_name, location || 'a new location')
    : POST_TEMPLATES[post_type](entity_name);

  const hasImage = media_url && (post_type === 'profile_pic_update' || post_type === 'cover_photo_update');
  const contentType = hasImage ? 'image' : 'text';
  const mediaUrls = hasImage ? [media_url] : [];

  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      author_id: user_id,
      content,
      content_type: contentType,
      media_urls: mediaUrls,
      visibility: 'public',
      metadata: {
        auto_generated: true,
        auto_post_type: post_type,
        entity_type: entity_type || 'user',
        ...(page_id ? { source_page_id: page_id } : {}),
      },
    })
    .select()
    .maybeSingle();

  if (error) {
    console.warn('[social/auto-post] failed to create:', error.message);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }

  return c.json({ success: true, data }, 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// /crews — GET list, POST {action: create|join|leave}
// ═══════════════════════════════════════════════════════════════════════════
app.get('/crews', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');

  const { data: memberships, error } = await supabase
    .from('crew_members')
    .select('role, crew:crews(id, name, description, avatar_url, crew_code, owner_id, created_at)')
    .eq('user_id', user.id);

  if (error) return c.json({ error: 'Failed to load crews', details: error.message }, 500);

  const crews = (memberships || []).map((m) => ({ ...m.crew, role: m.role }));
  return c.json({ success: true, crews });
});

app.post('/crews', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const userId = user.id;
  const body = await c.req.json().catch(() => ({}));
  const { action, payload } = body;

  if (!action) return c.json({ error: 'Action is required.' }, 400);

  if (action === 'create') {
    const { name, description, avatar_url } = payload || {};
    if (!name || name.trim() === '') return c.json({ error: 'Crew name is required.' }, 400);

    const crew_code = 'CRW-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: crew, error: createErr } = await supabase
      .from('crews')
      .insert({
        name: name.trim(),
        description: description ? description.trim() : null,
        avatar_url: avatar_url || null,
        owner_id: userId,
        crew_code,
      })
      .select()
      .maybeSingle();

    if (createErr) {
      console.warn('[social/crews] create error:', createErr);
      return c.json({ error: 'Failed to create crew.', details: createErr.message }, 500);
    }

    const { error: memberErr } = await supabase
      .from('crew_members')
      .insert({ crew_id: crew.id, user_id: userId, role: 'owner' });

    if (memberErr) {
      console.warn('[social/crews] add owner-as-member error:', memberErr);
    }

    return c.json({ success: true, crew });
  }

  if (action === 'join') {
    const { crew_code } = payload || {};
    if (!crew_code) return c.json({ error: 'Crew code is required.' }, 400);

    const sanitizedCode = crew_code.trim().toUpperCase();

    const { data: crew, error: findErr } = await supabase
      .from('crews')
      .select('id, name')
      .eq('crew_code', sanitizedCode)
      .maybeSingle();

    if (findErr || !crew) return c.json({ error: 'Invalid crew code.' }, 404);

    const { count: memberCount, error: countErr } = await supabase
      .from('crew_members')
      .select('*', { count: 'exact', head: true })
      .eq('crew_id', crew.id);

    if (countErr) return c.json({ error: 'Failed to check crew capacity.' }, 500);
    if (memberCount >= 20) {
      return c.json({ error: 'This Crew has reached the maximum size of 20 members.' }, 400);
    }

    const { data: existing } = await supabase
      .from('crew_members')
      .select('id')
      .eq('crew_id', crew.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) return c.json({ error: 'You are already a member of this crew.' }, 400);

    const { data: joinRecord, error: joinErr } = await supabase
      .from('crew_members')
      .insert({ crew_id: crew.id, user_id: userId, role: 'member' })
      .select()
      .maybeSingle();

    if (joinErr) {
      console.warn('[social/crews] join error:', joinErr);
      return c.json({ error: 'Failed to join crew.' }, 500);
    }

    return c.json({ success: true, message: `Successfully joined ${crew.name}`, record: joinRecord });
  }

  if (action === 'leave') {
    const { crew_id } = payload || {};
    if (!crew_id) return c.json({ error: 'Crew ID is required.' }, 400);

    const { error: leaveErr } = await supabase
      .from('crew_members')
      .delete()
      .match({ crew_id, user_id: userId });

    if (leaveErr) {
      console.warn('[social/crews] leave error:', leaveErr);
      return c.json({ error: 'Failed to leave crew.' }, 500);
    }

    return c.json({ success: true, message: 'Successfully left crew.' });
  }

  return c.json({ error: 'Invalid action.' }, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /share-count — atomic share counter for posts/reels
// ═══════════════════════════════════════════════════════════════════════════
app.post('/share-count', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { post_id } = body;

  if (!post_id) return c.json({ error: 'post_id is required' }, 400);

  try {
    let source = 'posts';
    const { data: reelCheck } = await supabase
      .from('social_reels')
      .select('id')
      .eq('id', post_id)
      .maybeSingle();
    if (reelCheck) source = 'reels';

    if (source === 'reels') {
      const { error: rpcError } = await supabase.rpc('increment_reel_count', {
        p_reel_id: post_id, p_field: 'share_count',
      });
      if (rpcError) {
        console.warn('[social/share-count] reel RPC failed (non-critical):', rpcError.message);
      }
    } else {
      const { error: rpcError } = await supabase.rpc('increment_post_count', {
        p_post_id: post_id, p_field: 'share_count',
      });
      if (rpcError) {
        const { data: post } = await supabase
          .from('social_posts')
          .select('share_count')
          .eq('id', post_id)
          .maybeSingle();
        if (post) {
          await supabase
            .from('social_posts')
            .update({ share_count: (post.share_count || 0) + 1 })
            .eq('id', post_id);
        }
      }
    }

    return c.json({ success: true });
  } catch (err) {
    console.warn('[social/share-count] error:', err);
    return c.json({ success: false });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /upload-url — presigned upload URL for direct-to-Supabase uploads
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_BUCKETS = ['social-media', 'stories'];
const DEFAULT_BUCKET = 'social-media';
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024;
const MAX_STORY_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/hevc', 'video/x-matroska',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
  'audio/x-m4a', 'audio/aac',
];

const EXT_MIME_MAP = {
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  avi: 'video/x-msvideo', webm: 'video/webm',
  '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
  hevc: 'video/hevc', mkv: 'video/x-matroska',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
  ogg: 'audio/ogg', mp3: 'audio/mpeg',
  m4a: 'audio/x-m4a', aac: 'audio/aac', wav: 'audio/wav',
};

function sniffMimeFromExt(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  return EXT_MIME_MAP[ext] || null;
}

app.post('/upload-url', uploadLimit, requireUser, async (c) => {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return c.json({ success: false, error: 'Server configuration error' }, 500);
  }

  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { fileName, fileSize, folder } = body;
  const prefix = user.id;
  const requestedBucket = body?.bucket || DEFAULT_BUCKET;
  const BUCKET = ALLOWED_BUCKETS.includes(requestedBucket) ? requestedBucket : DEFAULT_BUCKET;

  let mimeType = (body?.mimeType || '').split(';')[0].trim();
  if (!mimeType && fileName) mimeType = sniffMimeFromExt(fileName) || '';
  if (mimeType === 'application/octet-stream' && fileName) {
    const sniffed = sniffMimeFromExt(fileName);
    if (sniffed) mimeType = sniffed;
  }

  if (!fileName || !fileSize || !mimeType) {
    return c.json(
      { success: false, error: 'Missing required fields: fileName, fileSize, mimeType' },
      400
    );
  }

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return c.json({ success: false, error: `File type not allowed: ${mimeType}` }, 400);
  }

  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');
  const maxSize = isVideo
    ? (BUCKET === 'stories' ? MAX_STORY_VIDEO_SIZE : MAX_VIDEO_SIZE)
    : isAudio
    ? 25 * 1024 * 1024
    : MAX_IMAGE_SIZE;

  if (fileSize > maxSize) {
    const maxMB = Math.round(maxSize / 1024 / 1024);
    return c.json({
      success: false,
      error: `File too large (max ${maxMB}MB for ${isVideo ? 'video' : isAudio ? 'audio' : 'image'} in ${BUCKET})`,
    }, 400);
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const storagePath = BUCKET === 'stories'
    ? [folder || 'stories', prefix, `${timestamp}_${safeName}`].filter(Boolean).join('/')
    : [
        isVideo ? (folder || 'videos') : isAudio ? (folder || 'audio') : (folder || 'photos'),
        prefix,
        `${timestamp}_${safeName}`,
      ].filter(Boolean).join('/');

  const { data: signData, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signError) {
    console.warn('[social/upload-url] signed URL error:', signError.message);
    return c.json(
      { success: false, error: 'Failed to create upload token: ' + signError.message },
      500
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;

  const tusEndpoint = supabaseUrl.includes('.supabase.co')
    ? supabaseUrl.replace('.supabase.co', '.storage.supabase.co') + '/storage/v1/upload/resumable'
    : `${supabaseUrl}/storage/v1/upload/resumable`;

  return c.json({
    success: true,
    tusEndpoint,
    token: signData.token,
    signedUrl: signData.signedUrl,
    path: storagePath,
    publicUrl,
    type: isVideo ? 'video' : isAudio ? 'audio' : 'photo',
    bucket: BUCKET,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /geocode-locations — Nominatim → Google fallback
// ═══════════════════════════════════════════════════════════════════════════
const NOMINATIM_DELAY_MS = 1100;

async function geocodeWithNominatim(locationStr) {
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?' +
      `q=${encodeURIComponent(locationStr)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SmarterPoker/1.0 (https://smarter.poker)' },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (results && results.length > 0) {
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeWithGoogle(locationStr) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) return null;
  try {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json?' +
      `address=${encodeURIComponent(locationStr)}&components=country:US&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeLocation(locationStr) {
  if (!locationStr || !locationStr.trim()) return null;
  const cleaned = locationStr.trim();
  const nominatimResult = await geocodeWithNominatim(cleaned);
  if (nominatimResult) return nominatimResult;
  return geocodeWithGoogle(cleaned);
}

app.post('/geocode-locations', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { page_id, locations } = body;

  if (!page_id) return c.json({ success: false, error: 'page_id is required' }, 400);
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return c.json({ success: false, error: 'locations array is required' }, 400);
  }

  const toGeocode = locations.slice(0, 10);

  const { data: page, error: fetchError } = await supabase
    .from('social_pages')
    .select('metadata, user_id, owner_id')
    .eq('id', page_id)
    .maybeSingle();

  if (fetchError || !page) return c.json({ success: false, error: 'Page not found' }, 404);

  const pageOwner = page.user_id || page.owner_id;
  if (pageOwner && pageOwner !== user.id) {
    return c.json({ success: false, error: 'Not authorized to modify this page' }, 403);
  }

  const metadata = page.metadata || {};
  const existing = metadata.geocoded_locations || {};
  const geocoded = { ...existing };
  const results = [];

  for (const loc of toGeocode) {
    const key = loc.trim();
    if (!key) continue;
    if (geocoded[key] && geocoded[key].lat && geocoded[key].lng) {
      results.push({ location: key, status: 'cached', ...geocoded[key] });
      continue;
    }
    const coords = await geocodeLocation(key);
    if (coords) {
      geocoded[key] = coords;
      results.push({ location: key, status: 'geocoded', ...coords });
    } else {
      results.push({ location: key, status: 'failed' });
    }
    await new Promise((resolve) => setTimeout(resolve, NOMINATIM_DELAY_MS));
  }

  const { error: updateError } = await supabase
    .from('social_pages')
    .update({
      metadata: { ...metadata, geocoded_locations: geocoded },
      updated_at: new Date().toISOString(),
    })
    .eq('id', page_id);

  if (updateError) {
    console.warn('[social/geocode-locations] update error:', updateError);
    return c.json({ success: false, error: 'Failed to save geocoded locations' }, 500);
  }

  return c.json({ success: true, geocoded, results });
});

// ═══════════════════════════════════════════════════════════════════════════
// /live-session — GET (multiple types) + POST (action dispatch)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/live-session', requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  c.header('Cache-Control', 'private, no-store');

  const type = safeQ(c.req.query('type'));
  const session_id = safeQ(c.req.query('session_id'));

  if (session_id) {
    const { data } = await supabase
      .from('live_sessions')
      .select('*, profiles:user_id(username, avatar_url, full_name)')
      .eq('id', session_id)
      .maybeSingle();
    return c.json({ session: data });
  }

  if (type === 'mine') {
    const { data } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    return c.json({ session: data || null });
  }

  if (type === 'friends') {
    const { data: friendRows } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted');

    const friendIds = (friendRows || []).map((f) =>
      f.user_id === user.id ? f.friend_id : f.user_id
    );
    if (friendIds.length === 0) return c.json({ sessions: [] });

    const { data: sessions } = await supabase
      .from('live_sessions')
      .select('*, profiles:user_id(username, avatar_url, full_name)')
      .in('user_id', friendIds)
      .in('status', ['active', 'break'])
      .in('privacy', ['public', 'friends'])
      .order('started_at', { ascending: false });
    return c.json({ sessions: sessions || [] });
  }

  // Default: public sessions
  const { data: sessions } = await supabase
    .from('live_sessions')
    .select('*, profiles:user_id(username, avatar_url, full_name)')
    .eq('privacy', 'public')
    .in('status', ['active', 'break'])
    .order('started_at', { ascending: false })
    .limit(50);

  return c.json({ sessions: sessions || [] });
});

app.post('/live-session', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'start') {
    const { venue_id, venue_name, game_type, stakes, privacy, notes } = body;
    const { data: existing } = await supabase
      .from('live_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    if (existing && existing.length > 0) {
      return c.json({ error: 'You already have an active session. End it first.' }, 400);
    }

    const roomName = `session-${user.id.slice(0, 8)}-${Date.now()}`;

    const { data: session, error: insertErr } = await supabase
      .from('live_sessions')
      .insert({
        user_id: user.id,
        venue_id: venue_id || null,
        venue_name: venue_name || 'Live Poker',
        game_type: game_type || 'NLH',
        stakes: stakes || '$1/$2',
        privacy: privacy || 'friends',
        notes: notes || null,
        livekit_room: roomName,
        status: 'active',
      })
      .select()
      .maybeSingle();

    if (insertErr) {
      console.warn('[social/live-session] start error:', insertErr);
      return c.json({ error: 'Failed to start session' }, 500);
    }
    return c.json({ session });
  }

  if (action === 'update') {
    const { session_id, current_profit, status, notes } = body;
    if (!session_id) return c.json({ error: 'session_id required' }, 400);

    const updates = {};
    if (current_profit !== undefined) updates.current_profit = parseInt(current_profit, 10) || 0;
    if (status && ['active', 'break'].includes(status)) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const { data, error: updErr } = await supabase
      .from('live_sessions')
      .update(updates)
      .eq('id', session_id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (updErr) {
      console.warn('[social/live-session] update error:', updErr);
      return c.json({ error: 'Failed to update session' }, 500);
    }
    return c.json({ session: data });
  }

  if (action === 'end') {
    const { session_id } = body;
    if (!session_id) return c.json({ error: 'session_id required' }, 400);

    const { data, error: endErr } = await supabase
      .from('live_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', session_id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (endErr) {
      console.warn('[social/live-session] end error:', endErr);
      return c.json({ error: 'Failed to end session' }, 500);
    }
    return c.json({ session: data });
  }

  if (action === 'chat') {
    const { session_id, message } = body;
    if (!session_id || !message) return c.json({ error: 'session_id and message required' }, 400);
    if (message.length > 500) return c.json({ error: 'Message too long (max 500 chars)' }, 400);

    const { data: msg, error: chatErr } = await supabase
      .from('session_chat_messages')
      .insert({ session_id, user_id: user.id, message: message.trim() })
      .select('*, profiles:user_id(username, avatar_url)')
      .maybeSingle();

    if (chatErr) {
      console.warn('[social/live-session] chat error:', chatErr);
      return c.json({ error: 'Failed to send chat message' }, 500);
    }
    return c.json({ message: msg });
  }

  return c.json({ error: 'Invalid action' }, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// /referral — GET stats, POST {action: generate|apply}
// ═══════════════════════════════════════════════════════════════════════════
const REFERRAL_BONUS_REFERRER = 100;
const REFERRAL_BONUS_REFEREE = 50;

function generateReferralCode(username) {
  const base = (username || 'SP').substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}-${suffix}`;
}

app.get('/referral', requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    let referralCode = profile?.referral_code;
    if (!referralCode) {
      referralCode = generateReferralCode(profile?.username);
      await supabase.from('profiles').update({ referral_code: referralCode }).eq('id', user.id);
    }

    const { count: totalReferrals } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', user.id)
      .eq('status', 'completed');

    const { data: earnedData } = await supabase
      .from('diamond_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('transaction_type', 'referral_bonus');

    const totalDiamondsEarned = (earnedData || []).reduce((sum, t) => sum + (t.amount || 0), 0);

    const { data: recentReferrals } = await supabase
      .from('referrals')
      .select('id, status, created_at, referee_id')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const referredIds = (recentReferrals || []).map((r) => r.referee_id).filter(Boolean);
    const referredProfiles = {};
    if (referredIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', referredIds);
      (profiles || []).forEach((p) => { referredProfiles[p.id] = p; });
    }

    const enrichedReferrals = (recentReferrals || []).map((r) => ({
      ...r,
      referredUser: referredProfiles[r.referee_id] || null,
    }));

    return c.json({
      referralCode,
      shareUrl: `https://smarter.poker/?ref=${referralCode}`,
      totalReferrals: totalReferrals || 0,
      totalDiamondsEarned,
      bonusPerReferral: REFERRAL_BONUS_REFERRER,
      recentReferrals: enrichedReferrals,
    });
  } catch (err) {
    console.warn('[social/referral] GET error:', err);
    return c.json({ error: 'Failed to load referral data' }, 500);
  }
});

app.post('/referral', writeLimit, requireUser, async (c) => {
  const supabase = c.get('supabase');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { action, code } = body;

  if (action === 'generate') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.referral_code) {
      return c.json({ code: profile.referral_code, existing: true });
    }

    const newCode = generateReferralCode(profile?.username);
    await supabase.from('profiles').update({ referral_code: newCode }).eq('id', user.id);
    return c.json({ code: newCode, existing: false });
  }

  if (action === 'apply' && code) {
    try {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('referral_code', code.trim().toUpperCase())
        .maybeSingle();

      if (!referrer) return c.json({ error: 'Invalid referral code' }, 404);
      if (referrer.id === user.id) {
        return c.json({ error: 'Cannot use your own referral code' }, 400);
      }

      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referee_id', user.id)
        .maybeSingle();

      if (existing) return c.json({ error: 'Referral already applied' }, 400);

      await supabase.from('referrals').insert({
        referrer_id: referrer.id,
        referee_id: user.id,
        referral_code_used: code.trim().toUpperCase(),
        status: 'completed',
      });

      await supabase
        .rpc('add_diamonds_to_balance', {
          p_user_id: referrer.id,
          p_amount: REFERRAL_BONUS_REFERRER,
          p_type: 'referral_bonus',
          p_description: 'Referral Bonus — New Player Joined',
          p_reference_id: user.id,
        })
        .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));

      await supabase
        .rpc('add_diamonds_to_balance', {
          p_user_id: user.id,
          p_amount: REFERRAL_BONUS_REFEREE,
          p_type: 'referral_bonus',
          p_description: `Welcome Bonus — Referred By ${referrer.username || 'A Friend'}`,
          p_reference_id: referrer.id,
        })
        .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));

      return c.json({
        success: true,
        bonusAwarded: REFERRAL_BONUS_REFEREE,
        referrerUsername: referrer.username,
      });
    } catch (err) {
      console.warn('[social/referral] apply error:', err);
      return c.json({ error: 'Failed to apply referral' }, 500);
    }
  }

  return c.json({ error: 'Invalid action' }, 400);
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[social] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[social] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
