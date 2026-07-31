import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Auto-Post API - Creates automatic social posts for profile updates
 * 
 * POST /api/social/auto-post
 * 
 * Body:
 *   user_id      - The user who triggered the update
 *   post_type    - One of: profile_pic_update, cover_photo_update, story_update, location_update
 *   media_url    - (optional) URL of the new image (for pic/cover updates)
 *   entity_name  - Display name for the post (e.g., "Bellagio Poker Room")
 *   entity_type  - One of: user, club, home_game (for context in post)
 *   page_id      - (optional) Social page ID if this is a page update
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(supabaseUrl, supabaseServiceKey);
    }
    return _supabase;
}

const POST_TEMPLATES = {
    profile_pic_update: (name) => `${name} updated their profile picture.`,
    cover_photo_update: (name) => `${name} updated their cover photo.`,
    story_update: (name) => `${name} updated their bio.`,
    location_update: (name, location) => `${name} updated their location to ${location}.`,
};

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();

      // Auth: require JWT token OR internal secret (for server-to-server calls)
      const token = req.headers.authorization?.replace('Bearer ', '');
      const internalSecret = req.headers['x-internal-secret'];
      let verified_user_id = null;

      // SECURITY: the trusted server-to-server branch requires a CONFIGURED
      // CRON_SECRET. This previously FAILED OPEN: with CRON_SECRET unset the
      // comparison was `undefined === undefined` → true for any request that
      // simply omitted the x-internal-secret header, so an anonymous caller
      // took the internal branch and could publish posts as any existing user.
      const envCronSecret = process.env.CRON_SECRET;
      const isInternalCall = Boolean(envCronSecret) && internalSecret === envCronSecret;

      if (isInternalCall) {
          // Internal server-to-server call — validate user_id exists before trusting it
          const rawUserId = req.body.user_id;
          if (!rawUserId) return res.status(400).json({ success: false, error: 'user_id required for internal calls' });
        // Enforce that internal calls can only post as the system/bot account unless explicitly authorized
        const botAccountId = process.env.BOT_ACCOUNT_ID;
        if (botAccountId && rawUserId !== botAccountId) {
            return res.status(403).json({ success: false, error: 'Internal calls restricted to bot account' });
        }
        // Verify the user_id is a real profile
        const { data: profileCheck } = await getSupabase().from('profiles').select('id').eq('id', rawUserId).maybeSingle();
        if (!profileCheck) return res.status(403).json({ success: false, error: 'Invalid user_id: profile not found' });
        verified_user_id = rawUserId;
      } else if (token) {
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          /* removed duplicate authUser */
          if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          verified_user_id = authUser.id;
      } else {
          return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { post_type, media_url, entity_name, entity_type, page_id, location } = req.body;
      const user_id = verified_user_id;

      if (!user_id || !post_type || !entity_name) {
          return res.status(400).json({ success: false, error: 'user_id, post_type, and entity_name are required' });
      }

      if (!POST_TEMPLATES[post_type]) {
          return res.status(400).json({ success: false, error: `Invalid post_type: ${post_type}. Valid: ${Object.keys(POST_TEMPLATES || {}).join(', ')}` });
      }

      try {
          // Generate post content
          const content = post_type === 'location_update'
              ? POST_TEMPLATES[post_type](entity_name, location || 'a new location')
              : POST_TEMPLATES[post_type](entity_name);

          const hasImage = media_url && (post_type === 'profile_pic_update' || post_type === 'cover_photo_update');
          const contentType = hasImage ? 'image' : 'text';
          const mediaUrls = hasImage ? [media_url] : [];

          // Insert into social_posts (global feed)
          const { data, error } = await getSupabase()
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
                      ...(page_id ? { source_page_id: page_id } : {})
                  }
              })
              .select()
              .maybeSingle();

          if (error) {
              console.warn('[AutoPost] Failed to create auto-post:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(201).json({ success: true, data });

      } catch (e) {
          console.warn('[AutoPost] Error:', e.message);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
