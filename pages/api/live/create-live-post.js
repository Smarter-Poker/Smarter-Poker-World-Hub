/**
 * POST /api/live/create-live-post
 * Creates a social_posts entry of content_type 'live' when a user starts broadcasting.
 * This makes the live stream visible in the news feed for friends and discovery.
 *
 * Body: { stream_id, title }
 * Returns: { success, postId }
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

    const { stream_id, title } = req.body;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    try {
        // Verify the stream exists and belongs to this user
        const { data: stream } = await supabase
            .from('live_streams')
            .select('id, broadcaster_id, thumbnail_url, title, category, description')
            .eq('id', stream_id)
            .maybeSingle();

        if (!stream) return res.status(404).json({ error: 'Stream not found' });
        if (stream.broadcaster_id !== user.id) return res.status(403).json({ error: 'Not your stream' });

        // Avoid duplicate live posts for the same stream
        const { data: existing } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', user.id)
            .eq('content_type', 'live')
            .contains('metadata', { stream_id })
            .maybeSingle();

        if (existing) {
            return res.json({ success: true, postId: existing.id, duplicate: true });
        }

        // Get broadcaster profile for display name
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, full_name')
            .eq('id', user.id)
            .maybeSingle();
        const displayName = profile?.username || profile?.full_name || 'Someone';

        // Create the live feed post
        const streamTitle = title || stream.title || 'Live Stream';
        const { data: post, error: postErr } = await supabase.from('social_posts').insert({
            author_id: user.id,
            content: `🔴 ${displayName} Is Live Now: ${streamTitle}`,
            content_type: 'live',
            media_urls: stream.thumbnail_url ? [stream.thumbnail_url] : [],
            thumbnail_url: stream.thumbnail_url || null,
            visibility: 'public',
            metadata: {
                stream_id,
                source: 'live_broadcast',
                category: stream.category || null,
                description: stream.description || null,
            },
        }).select('id').maybeSingle();

        if (postErr) {
            console.warn('[create-live-post] insert error:', postErr.message);
            return res.status(500).json({ error: 'Failed to create live post' });
        }

        // Store the post ID on the stream for later reference (update/cleanup)
        await supabase.from('live_streams').update({
            feed_post_id: post?.id || null,
        }).eq('id', stream_id).catch(() => {});

        return res.json({ success: true, postId: post?.id });
    } catch (err) {
        console.warn('[create-live-post] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
