/**
 * Create Social Post API
 * POST /api/social/create-post
 * 
 * Allows authenticated users to create a social post on their Smarter.Poker feed.
 * Used by tournament public page "Post to My Page" button.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Authenticate user via Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        const { content, content_type = 'text', visibility = 'public', metadata, media_urls } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Content is required' });
        }
        if (content.length > 10000) {
            return res.status(400).json({ success: false, error: 'Content exceeds maximum length of 10,000 characters' });
        }
        if (media_urls && media_urls.length > 10) {
            return res.status(400).json({ success: false, error: 'Maximum 10 media attachments allowed' });
        }

        // Try RPC first (handles RLS), fallback to direct insert
        let post = null;
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('fn_create_social_post', {
                p_author_id: user.id,
                p_content: content.trim(),
                p_content_type: content_type,
                p_media_urls: media_urls || [],
                p_visibility: visibility,
                p_achievement_data: metadata ? JSON.stringify(metadata) : null
            });

        if (rpcError) {
            // Fallback: direct insert with service role key
            const { data: directPost, error: directError } = await supabase
                .from('social_posts')
                .insert({
                    author_id: user.id,
                    content: content.trim(),
                    content_type,
                    visibility,
                    metadata: metadata || null,
                    created_at: new Date().toISOString()
                })
                .select('id')
                .maybeSingle();

            if (directError || !directPost) {
                console.error('Create post error:', directError);
                return res.status(500).json({ success: false, error: 'Failed to create post' });
            }
            post = directPost;
        } else {
            if (!rpcResult) {
                console.error('Create post error: RPC returned null');
                return res.status(500).json({ success: false, error: 'Failed to create post' });
            }
            post = rpcResult;
        }

        return res.status(200).json({
            success: true,
            data: { post_id: post.id }
        });
    } catch (err) {
        console.error('Create post error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
