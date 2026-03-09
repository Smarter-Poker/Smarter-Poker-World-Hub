/**
 * DELETE POST API - Server-side deletion with god mode support
 * This endpoint allows god mode users to delete any post by using the service role
 * which bypasses RLS policies.
 * 
 * POST /api/posts/delete
 * Body: { postId: string }
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
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
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
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

        // Get the post to check ownership
        const { data: post } = await supabaseAdmin
            .from('social_posts')
            .select('id, author_id')
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

        // Delete the post using admin client (bypasses RLS)
        const { error: deleteError } = await supabaseAdmin
            .from('social_posts')
            .delete()
            .eq('id', postId);

        if (deleteError) {
            console.error('[Delete Post] Error:', deleteError);
            return res.status(500).json({ success: false, error: 'Failed to delete post', details: deleteError.message });
        }

        return res.status(200).json({ success: true, deletedBy: isGodMode ? 'god' : 'owner' });

    } catch (e) {
        console.error('[Delete Post] Unexpected error:', e);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
