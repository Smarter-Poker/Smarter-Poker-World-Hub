/**
 * Create Social Post API
 * POST /api/social/create-post
 *
 * Allows authenticated users to create a social post on their Smarter.Poker feed.
 * Used by tournament public page "Post to My Page" button.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Authenticate user via Bearer token
      const user = await requireAuth(req, res);
      if (!user) return;

      if (!applyRateLimit(req, res, LIMITS.write)) return;

      try {
          const { content, content_type = 'text', visibility = 'public', metadata, media_urls, thumbnail_url } = req.body;

          const hasContent = content && content.trim().length > 0;
          const hasMedia = Array.isArray(media_urls) && media_urls.length > 0;
          // Media-only posts send no `content`; normalise once so the RPC and the
          // fallback insert never call .trim() on undefined (was a 500 on every
          // caption-less photo/video post).
          const contentText = (content || '').trim();

          if (!hasContent && !hasMedia) {
              return res.status(400).json({ success: false, error: 'Content or media required' });
          }
          if (hasContent && content.length > 10000) {
              return res.status(400).json({ success: false, error: 'Content exceeds maximum length of 10,000 characters' });
          }
          if (hasMedia && media_urls.length > 10) {
              return res.status(400).json({ success: false, error: 'Maximum 10 media attachments allowed' });
          }

          // Try RPC first (handles RLS), fallback to direct insert
          let post = null;
          const { data: rpcResult, error: rpcError } = await getSupabase()
              .rpc('fn_create_social_post', {
                  p_author_id: user.id,
                  p_content: contentText,
                  p_content_type: content_type,
                  p_media_urls: media_urls || [],
                  p_visibility: visibility,
                  // jsonb param — supabase-js serialises objects natively;
                  // JSON.stringify double-encoded it into a JSON *string*.
                  p_achievement_data: metadata || null,
                  p_thumbnail_url: thumbnail_url || null,
              });

          // The RPC traps its own exceptions and returns {success:false,
          // error} with NO Supabase-level error — treat that as a failure and
          // fall through to the direct insert (2026-08-15 audit fix; mirrors
          // SocialService.createPost).
          const rpcFailed = rpcError || !(rpcResult?.success === true && rpcResult?.id) && !rpcResult?.id;

          if (rpcFailed) {
              // Fallback: direct insert with service role key.
              // IMPORTANT: keep this column list in sync with fn_create_social_post —
              // dropping a field here silently loses data when the RPC fails. Bug
              // history: thumbnail_url was missing here for ~6 weeks, so any post
              // created via the fallback path lost its thumbnail.
              const { data: directPost, error: directError } = await getSupabase()
                  .from('social_posts')
                  .insert({
                      author_id: user.id,
                      content: contentText,
                      content_type,
                      media_urls: media_urls || [],
                      visibility,
                      metadata: metadata || null,
                      thumbnail_url: thumbnail_url || null,
                      created_at: new Date().toISOString()
                  })
                  .select('id')
                  .maybeSingle();

              if (directError || !directPost) {
                  console.warn('Create post error:', directError);
                  return res.status(500).json({ success: false, error: 'Failed to create post' });
              }
              post = directPost;
          } else {
              post = { id: rpcResult.id };
              // fn_create_social_post has no metadata parameter — persist it
              // directly so page-attributed posts render correctly in the feed
              // (the feed reads metadata.page_name / metadata.page_avatar_url).
              if (metadata) {
                  const { error: metaErr } = await getSupabase()
                      .from('social_posts')
                      .update({ metadata })
                      .eq('id', rpcResult.id);
                  if (metaErr) console.warn('Create post: metadata persist failed:', metaErr.message);
              }
          }

          return res.status(200).json({
              success: true,
              data: { post_id: post.id }
          });
      } catch (err) {
          console.warn('Create post error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
