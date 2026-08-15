/**
 * POST /api/social/share-reel-to-feed
 * Server-side handler to share a reel to the user's social feed.
 * Uses service-role to bypass RLS and handles trigger errors gracefully.
 *
 * Body: { reel_id, video_url, caption, user_description }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { reel_id, video_url, caption, user_description } = req.body;
    if (!reel_id) return res.status(400).json({ error: 'reel_id required' });

    try {
        const reelLink = `https://smarter.poker/hub/reels?id=${reel_id}`;

        // Duplicate guard
        const { data: existing } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', user.id)
            .eq('link_url', reelLink)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.json({ success: true, already_shared: true, postId: existing[0].id });
        }

        // Build content: user description first, then original caption
        const parts = [];
        if (user_description?.trim()) parts.push(user_description.trim());
        if (caption?.trim()) parts.push(caption.trim());
        parts.push(reelLink);
        const postContent = parts.join('\n\n');

        const { data: post, error } = await supabase.from('social_posts').insert({
            author_id: user.id,
            content: postContent,
            content_type: video_url ? 'video' : 'text',
            media_urls: video_url ? [video_url] : [],
            visibility: 'public',
            link_url: reelLink,
        }).select('id').maybeSingle();

        if (error) {
            console.warn('[share-reel-to-feed] Insert error:', error.message);
            // If the trigger error is the auto-story one, the post itself may have succeeded
            // Check if the post was actually created despite the trigger error
            if (error.message?.includes('trigger procedure')) {
                const { data: check } = await supabase
                    .from('social_posts')
                    .select('id')
                    .eq('author_id', user.id)
                    .eq('link_url', reelLink)
                    .limit(1);
                if (check && check.length > 0) {
                    return res.json({ success: true, postId: check[0].id, trigger_warning: true });
                }
            }
            return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true, postId: post?.id });
    } catch (err) {
        console.warn('[share-reel-to-feed] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
