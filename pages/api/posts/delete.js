/**
 * DELETE POST API - Server-side deletion with god mode support
 * This endpoint allows god mode users to delete any post by using the service role
 * which bypasses RLS policies.
 * 
 * POST /api/posts/delete
 * Body: { postId: string }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { postId } = req.body;
      if (!postId) {
          return res.status(400).json({ success: false, error: 'postId required' });
      }

      try {
          // Create admin client with service role (bypasses RLS)
          const supabaseAdmin = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY
          );

          // First, verify the requesting user from the auth header
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Unauthorized - no token' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({ success: false, error: 'Unauthorized - invalid token' });
          }

          // Check if user is god mode
          const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('id, role')
              .eq('id', user.id)
              .maybeSingle();

          if (!profile) {
              return res.status(401).json({ success: false, error: 'Profile not found' });
          }

          // Get the post to check ownership AND capture media_urls for storage cleanup
          const { data: post } = await supabaseAdmin
              .from('social_posts')
              .select('id, author_id, media_urls')
              .eq('id', postId)
              .maybeSingle();

          if (!post) {
              return res.status(404).json({ success: false, error: 'Post not found' });
          }

          // Check permissions: either own post OR god mode
          const isOwnPost = post.author_id === profile.id;
          const isGodMode = profile.role === 'god';

          if (!isOwnPost && !isGodMode) {
              return res.status(403).json({ success: false, error: 'Forbidden - not authorized to delete this post' });
          }

          // ── Storage cleanup: purge orphaned blobs before deleting the DB row ──
          // Fire-and-forget: we log failures but never block deletion on storage errors.
          if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
              try {
                  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
                  const BUCKET = 'social-media';
                  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
                  const storagePaths = post.media_urls
                      .filter(url => typeof url === 'string' && url.startsWith(publicPrefix))
                      .map(url => url.slice(publicPrefix.length).split('?')[0]); // strip query params
                  if (storagePaths.length > 0) {
                      const { error: storageErr } = await supabaseAdmin.storage
                          .from(BUCKET)
                          .remove(storagePaths);
                      if (storageErr) {
                          console.warn('[Delete Post] Storage cleanup partial failure:', storageErr.message, 'paths:', storagePaths);
                      }
                  }
              } catch (storageEx) {
                  console.warn('[Delete Post] Storage cleanup exception (non-blocking):', storageEx?.message);
              }
          }

          // Delete the post using admin client (bypasses RLS)
          const { error: deleteError } = await supabaseAdmin
              .from('social_posts')
              .delete()
              .eq('id', postId);

          if (deleteError) {
              console.warn('[Delete Post] Error:', deleteError);
              return res.status(500).json({ success: false, error: 'Failed to delete post', details: deleteError.message });
          }

          return res.status(200).json({ success: true, deletedBy: isGodMode ? 'god' : 'owner' });

      } catch (e) {
          console.warn('[Delete Post] Unexpected error:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
