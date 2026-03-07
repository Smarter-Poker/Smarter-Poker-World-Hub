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

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
    return createClient(supabaseUrl, supabaseServiceKey);
}

const POST_TEMPLATES = {
    profile_pic_update: (name) => `${name} updated their profile picture.`,
    cover_photo_update: (name) => `${name} updated their cover photo.`,
    story_update: (name) => `${name} updated their bio.`,
    location_update: (name, location) => `${name} updated their location to ${location}.`,
};

export default async function handler(req, res) {
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

    if (internalSecret === process.env.CRON_SECRET) {
        // Internal server-to-server call — trust user_id from body
        verified_user_id = req.body.user_id;
    } else if (token) {
        const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
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
        return res.status(400).json({ success: false, error: `Invalid post_type: ${post_type}. Valid: ${Object.keys(POST_TEMPLATES).join(', ')}` });
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
                    ...(page_id ? { source_page_id: page_id } : {})
                }
            })
            .select()
            .maybeSingle();

        if (error) {
            console.error('[AutoPost] Failed to create auto-post:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(201).json({ success: true, data });

    } catch (e) {
        console.error('[AutoPost] Error:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
}
