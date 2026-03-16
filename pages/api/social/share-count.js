/**
 * 📊 SHARE COUNT INCREMENT API
 * pages/api/social/share-count.js
 * 
 * Increments the share_count on social_posts when a user shares a post.
 * Fire-and-forget endpoint — non-critical if it fails.
 * 
 * BUG FIX: Replaced broken supabase.raw fallback with proper SQL increment.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { post_id } = req.body;

    if (!post_id) {
        return res.status(400).json({ error: 'post_id is required' });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Try RPC first (if fn exists)
        const { error: rpcError } = await supabase.rpc('increment_share_count', { p_post_id: post_id });

        if (rpcError) {
            // Fallback: read current count and increment by 1
            const { data: post, error: readError } = await supabase
                .from('social_posts')
                .select('share_count')
                .eq('id', post_id)
                .maybeSingle();

            if (!readError && post) {
                const newCount = (post.share_count || 0) + 1;
                const { error: updateError } = await supabase
                    .from('social_posts')
                    .update({ share_count: newCount })
                    .eq('id', post_id);

                if (updateError) {
                    console.warn('Share count update failed (non-critical):', updateError.message);
                }
            }
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Share count API error:', err);
        return res.status(200).json({ success: false }); // Don't fail the request
    }
}
