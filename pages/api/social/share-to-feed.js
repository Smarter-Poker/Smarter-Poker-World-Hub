/**
 * POST /api/social/share-to-feed
 * Creates a "shared/quoted" post on the user's feed.
 * The new post references the original post and includes the user's commentary.
 *
 * Body: { original_post_id, commentary }
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

    // Rate limiting
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { original_post_id, commentary } = req.body;
    if (!original_post_id) return res.status(400).json({ error: 'original_post_id required' });

    try {
        // 1. Fetch the original post
        const { data: original, error: fetchErr } = await supabase
            .from('social_posts')
            .select('id, author_id, content, media_urls, content_type, link_url')
            .eq('id', original_post_id)
            .maybeSingle();

        if (fetchErr || !original) {
            return res.status(404).json({ error: 'Original post not found' });
        }

        // 2. Duplicate guard — don't let the same user share the same post twice
        const postLink = `https://smarter.poker/hub/post/${original_post_id}`;
        const { data: existing } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', user.id)
            .eq('link_url', postLink)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.json({ success: true, already_shared: true, postId: existing[0].id });
        }

        // 3. Build the shared post content
        const parts = [];
        if (commentary?.trim()) parts.push(commentary.trim());
        // Embed original content as a quote
        if (original.content?.trim()) {
            parts.push(`> ${original.content.trim().split('\n').join('\n> ')}`);
        }
        parts.push(postLink);
        const postContent = parts.join('\n\n');

        // 4. Create the shared post
        const { data: post, error: insertErr } = await supabase.from('social_posts').insert({
            author_id: user.id,
            content: postContent,
            content_type: 'shared',
            media_urls: original.media_urls || [],
            visibility: 'public',
            link_url: postLink,
            shared_post_id: original.id,
        }).select('id').maybeSingle();

        if (insertErr) {
            console.warn('[share-to-feed] Insert error:', insertErr.message);
            // Handle trigger errors gracefully (same pattern as share-reel-to-feed)
            if (insertErr.message?.includes('trigger procedure')) {
                const { data: check } = await supabase
                    .from('social_posts')
                    .select('id')
                    .eq('author_id', user.id)
                    .eq('link_url', postLink)
                    .limit(1);
                if (check && check.length > 0) {
                    return res.json({ success: true, postId: check[0].id, trigger_warning: true });
                }
            }
            return res.status(500).json({ error: insertErr.message });
        }

        // 5. Increment share_count on the original post (fire-and-forget)
        try {
            const { error: rpcErr } = await supabase.rpc('increment_post_count', {
                p_post_id: original_post_id, p_field: 'share_count'
            });
            if (rpcErr) {
                // Fallback: manual increment
                const { data: p } = await supabase
                    .from('social_posts')
                    .select('share_count')
                    .eq('id', original_post_id)
                    .maybeSingle();
                if (p) {
                    const { error: err_social_posts_vcutw } = await supabase.from('social_posts').update({ share_count: (p.share_count || 0) + 1 })
                        .eq('id', original_post_id);
                    if (err_social_posts_vcutw) console.warn('[Supabase] Silent mutation failed in social_posts:', err_social_posts_vcutw.message);
                }
            }
        } catch (_) { /* non-critical */ }

        // 6. Notify the original author (if different from sharer)
        if (original.author_id !== user.id) {
            try {
                const { error: err_notifications_kdynx } = await supabase.from('notifications').insert({
                    user_id: original.author_id,
                    type: 'share',
                    message: 'shared your post',
                    data: { actor_id: user.id, reference_id: original_post_id },
                });
                if (err_notifications_kdynx) console.warn('[Supabase] Silent mutation failed in notifications:', err_notifications_kdynx.message);
            } catch (_) { /* non-critical */ }
        }

        // Analytics: log this share
        try {
            const { error: err_share_events_78c11 } = await supabase.from('share_events').insert({
                post_id: original_post_id, user_id: user.id, destination: 'feed',
            });
            if (err_share_events_78c11) console.warn('[Supabase] Silent mutation failed in share_events:', err_share_events_78c11.message);
        } catch (_) { /* non-critical */ }

        return res.json({ success: true, postId: post?.id });
    } catch (err) {
        console.warn('[share-to-feed] Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
