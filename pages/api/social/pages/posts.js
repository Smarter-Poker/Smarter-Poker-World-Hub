import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Social Page Posts API - Feed content for pages
 *
 * GET  /api/social/pages/posts?page_id=<id>  - Get posts for a page
 * POST /api/social/pages/posts               - Create post on a page
 * PUT  /api/social/pages/posts               - Update a post
 * DELETE /api/social/pages/posts?id=<id>     - Delete a post
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../../src/lib/auth-middleware';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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


      if (req.method === 'GET') {
          // Page post feeds are public — safe to cache 30s at the CDN edge
          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
          const safeP = (v) => Array.isArray(v) ? v[0] : v;
          const page_id = safeP(req.query.page_id);
          const author_id = safeP(req.query.author_id);
          const user_id = safeP(req.query.user_id);
          const pinned_only = safeP(req.query.pinned_only);
          const limit = Math.min(parseInt(safeP(req.query.limit)) || 20, 100);
          const offset = Math.min(Math.max(parseInt(safeP(req.query.offset)) || 0, 0), 10000);

          if (!page_id && !author_id) {
              return res.status(400).json({ success: false, error: 'page_id or author_id required' });
          }

          // Service role bypasses RLS: only public posts are served from
          // this unauthenticated endpoint (visibility is honoured on write
          // but was never honoured on read — private/home-game page posts
          // were enumerable by author_id).
          let query = getSupabase()
              .from('social_page_posts')
              .select('*')
              .eq('is_approved', true)
              .or('visibility.eq.public,visibility.is.null');

          if (page_id) query = query.eq('page_id', page_id);
          if (author_id) query = query.eq('author_id', author_id);
          if (pinned_only === 'true') query = query.eq('is_pinned', true);

          // Pinned first, then by date
          query = query
              .order('is_pinned', { ascending: false })
              .order('created_at', { ascending: false })
              .range(offset, offset + limit - 1);

          const { data, error } = await query;
          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

          // Enrich with author profiles
          const authorIds = [...new Set((data || []).map(p => p.author_id))];
          let profiles = {};
          if (authorIds.length > 0) {
              const { data: profileData } = await getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, avatar_url')
                  .in('id', authorIds)
                      .limit(100);
              (profileData || []).forEach(p => { profiles[p.id] = p; });
          }

          // Check user likes — derive identity from JWT, never from client query params
          let userLikes = new Set();
          if (data && data.length > 0) {
              // JWT-verified personalization: only apply when Authorization header is present
              const authHeader = req.headers.authorization;
              const jwtToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
              if (jwtToken) {
                  try {
                      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
                      const verifiedUserId = authData?.user?.id;
                      if (verifiedUserId) {
                          const postIds = data.map(p => p.id);
                          const { data: likes } = await getSupabase()
                              .from('social_page_post_likes')
                              .select('post_id')
                              .eq('user_id', verifiedUserId)
                              .in('post_id', postIds)
                              .limit(100);
                          (likes || []).forEach(l => userLikes.add(l.post_id));
                      }
                  } catch { /* JWT verification failed — return un-liked state */ }
              }
          }

          const enriched = (data || []).map(p => ({
              ...p,
              author: profiles[p.author_id] || null,
              user_liked: userLikes.has(p.id)
          }));

          return res.status(200).json({ success: true, data: enriched });

      } else if (req.method === 'POST') {
          // Require JWT auth for creating posts
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { page_id, content, content_type, media_urls, thumbnail_url,
              link_preview, visibility, is_pinned, post_type, metadata } = req.body;
          const author_id = authUser.id;

          if (!page_id) {
              return res.status(400).json({ success: false, error: 'page_id required' });
          }

          if (!content && (!media_urls || media_urls.length === 0)) {
              return res.status(400).json({ success: false, error: 'Content or media required' });
          }

          // Check if page requires approval
          const { data: page } = await getSupabase()
              .from('social_pages')
              .select('require_post_approval, owner_id, allow_member_posts, name, avatar_url, page_type')
              .eq('id', page_id)
              .maybeSingle();

          if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

          const isOwner = page.owner_id === author_id;

          // Check if user can post
          if (!isOwner && !page.allow_member_posts) {
              // Check if admin/moderator
              const { data: membership } = await getSupabase()
                  .from('social_page_followers')
                  .select('role')
                  .eq('page_id', page_id)
                  .eq('user_id', author_id)
                  .maybeSingle();

              if (!membership || !['admin', 'moderator', 'owner'].includes(membership.role)) {
                  return res.status(403).json({ success: false, error: 'Only admins can post on this page' });
              }
          }

          const { data, error } = await getSupabase()
              .from('social_page_posts')
              .insert({
                  page_id,
                  author_id,
                  content: content || '',
                  content_type: content_type || 'text',
                  media_urls: media_urls || [],
                  // Persist thumbnail at the source so club-page-direct rendering
                  // shows the preview frame too (column added 2026-04-30).
                  // Without this, only the global-feed mirror got the thumbnail
                  // and viewers ON the club page saw a black box.
                  thumbnail_url: thumbnail_url || null,
                  link_preview,
                  visibility: visibility || 'public',
                  is_pinned: isOwner ? (is_pinned || false) : false,
                  post_type: isOwner ? (post_type || 'regular') : 'regular',
                  is_approved: isOwner || !page.require_post_approval,
                  metadata: metadata || {}
              })
              .select()
              .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

          // Mirror to social_posts for global feed visibility (non-blocking).
          // Only mirror approved, public posts.
          // Sweep-4 audit fix (2026-04-29): include thumbnail_url so videos
          // posted to home groups show their preview frame in the global feed
          // (was being silently dropped — videos appeared as black squares).
          if (data && data.is_approved && (data.visibility === 'public' || !data.visibility)) {
              try {
                  const { error: err_social_posts_00kbv } = await getSupabase()
                    .from('social_posts')
                    .insert({
                          author_id: author_id, // Use actual poster, not page owner
                          content: data.content,
                          content_type: data.content_type || 'text',
                          media_urls: data.media_urls || [],
                          thumbnail_url: thumbnail_url || data.thumbnail_url || null,
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
                  if (err_social_posts_00kbv) console.warn('[Supabase] Silent mutation failed in social_posts:', err_social_posts_00kbv.message);
              } catch (mirrorErr) {
                  console.warn('[PagePosts] Failed to mirror post to global feed:', mirrorErr.message);
                  // Non-fatal — page post was still created successfully
              }
          }

          return res.status(201).json({ success: true, data });

      } else if (req.method === 'PUT') {
          // Require JWT auth for updating posts
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const { id, content, media_urls, link_preview, is_pinned, visibility } = req.body;
          const author_id = authUser.id; // Use authenticated user, not request body

          if (!id) {
              return res.status(400).json({ success: false, error: 'id required' });
          }

          // Verify ownership or admin status
          const { data: post } = await getSupabase()
              .from('social_page_posts')
              .select('author_id, page_id')
              .eq('id', id)
              .maybeSingle();

          if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

          const isAuthor = post.author_id === author_id;

          // Always check page admin status (needed for pin permission)
          const { data: page } = await getSupabase()
              .from('social_pages')
              .select('owner_id')
              .eq('id', post.page_id)
              .maybeSingle();
          const isPageAdmin = page?.owner_id === author_id;

          if (!isAuthor && !isPageAdmin) {
              return res.status(403).json({ success: false, error: 'Not authorized' });
          }

          const updates = { updated_at: new Date().toISOString() };
          if (content !== undefined) updates.content = content;
          if (media_urls !== undefined) updates.media_urls = media_urls;
          if (link_preview !== undefined) updates.link_preview = link_preview;
          if (is_pinned !== undefined && isPageAdmin) updates.is_pinned = is_pinned;
          if (visibility !== undefined) updates.visibility = visibility;

          const { data, error } = await getSupabase()
              .from('social_page_posts')
              .update(updates)
              .eq('id', id)
              .select()
              .maybeSingle();

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });
          return res.status(200).json({ success: true, data });

      } else if (req.method === 'DELETE') {
          // Require JWT auth for deleting posts
          const authUser = await requireAuth(req, res);
          if (!authUser) return;

          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const id = safeQ(req.query.id);
          const author_id = authUser.id; // Use authenticated user, not query param

          if (!id) return res.status(400).json({ success: false, error: 'id required' });

          // Verify ownership — also fetch media_urls for storage cleanup
          const { data: post } = await getSupabase()
              .from('social_page_posts')
              .select('author_id, page_id, media_urls')
              .eq('id', id)
              .maybeSingle();

          if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

          const isAuthor = post.author_id === author_id;
          let isPageOwner = false;
          if (!isAuthor) {
              const { data: page } = await getSupabase()
                  .from('social_pages')
                  .select('owner_id')
                  .eq('id', post.page_id)
                  .maybeSingle();
              isPageOwner = page?.owner_id === author_id;
          }

          if (!isAuthor && !isPageOwner) {
              return res.status(403).json({ success: false, error: 'Not authorized' });
          }

          // ── Storage cleanup: purge orphaned blobs before deleting the DB row ──
          if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
              try {
                  const supabaseStorageUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
                  const BUCKET = 'social-media';
                  const publicPrefix = `${supabaseStorageUrl}/storage/v1/object/public/${BUCKET}/`;
                  const storagePaths = post.media_urls
                      .filter(url => typeof url === 'string' && url.startsWith(publicPrefix))
                      .map(url => url.slice(publicPrefix.length).split('?')[0]);
                  if (storagePaths.length > 0) {
                      const { error: storageErr } = await getSupabase().storage.from(BUCKET).remove(storagePaths);
                      if (storageErr) console.warn('[PagePosts DELETE] Storage cleanup failure:', storageErr.message);
                  }
              } catch (storageEx) {
                  console.warn('[PagePosts DELETE] Storage cleanup exception (non-blocking):', storageEx?.message);
              }
          }

          const { error } = await getSupabase()
              .from('social_page_posts')
              .delete()
              .eq('id', id);

          if (error) return res.status(500).json({ success: false, error: 'Internal server error' });

          // ── Mirror cleanup: delete the corresponding social_posts global feed row ──
          // When the page post was created it was mirrored via metadata.source_post_id.
          // Deleting the page post must cascade to the global feed mirror.
          try {
              const { error: err_social_posts_1krjr } = await getSupabase()
                .from('social_posts')
                .delete()
                  .contains('metadata', { source_post_id: id });
              if (err_social_posts_1krjr) console.warn('[Supabase] Silent mutation failed in social_posts:', err_social_posts_1krjr.message);
          } catch (mirrorDeleteErr) {
              console.warn('[PagePosts DELETE] Failed to remove global feed mirror (non-blocking):', mirrorDeleteErr?.message);
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
