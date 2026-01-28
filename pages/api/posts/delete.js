/**
 * DELETE POST API - Server-side deletion with god mode support
 * This endpoint allows god mode users to delete any post by using the service role
 * which bypasses RLS policies.
 * 
 * POST /api/posts/delete
 * Body: { postId: string }
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { postId } = req.body;
    if (!postId) {
        return res.status(400).json({ error: 'postId required' });
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
            return res.status(401).json({ error: 'Unauthorized - no token' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - invalid token' });
        }

        // Check if user is god mode
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('id', user.id)
            .single();

        if (!profile) {
            return res.status(401).json({ error: 'Profile not found' });
        }

        // Get the post to check ownership
        const { data: post } = await supabaseAdmin
            .from('social_posts')
            .select('id, author_id')
            .eq('id', postId)
            .single();

        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Check permissions: either own post OR god mode
        const isOwnPost = post.author_id === profile.id;
        const isGodMode = profile.role === 'god';

        if (!isOwnPost && !isGodMode) {
            return res.status(403).json({ error: 'Forbidden - not authorized to delete this post' });
        }

        // Delete the post using admin client (bypasses RLS)
        const { error: deleteError } = await supabaseAdmin
            .from('social_posts')
            .delete()
            .eq('id', postId);

        if (deleteError) {
            console.error('[Delete Post] Error:', deleteError);
            return res.status(500).json({ error: 'Failed to delete post', details: deleteError.message });
        }

        console.log(`[Delete Post] ✅ Post ${postId} deleted by ${profile.role === 'god' ? 'GOD MODE' : 'owner'} user ${user.id}`);
        return res.status(200).json({ success: true, deletedBy: isGodMode ? 'god' : 'owner' });

    } catch (e) {
        console.error('[Delete Post] Unexpected error:', e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
