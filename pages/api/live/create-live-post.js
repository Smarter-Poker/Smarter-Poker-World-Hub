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

        // BUG-FIX-DEEP-AUDIT-R2 CLP-4: idempotency anchor on live_streams.feed_post_id.
        // The previous duplicate guard did
        //   SELECT social_posts WHERE author_id=… AND content_type='live'
        //                       AND metadata @> {stream_id}
        // then INSERT. Two concurrent requests both passed the SELECT
        // (the row didn't exist yet for either) and both INSERTed,
        // producing two live feed posts for the same stream.
        //
        // New approach:
        //   1. Re-check live_streams.feed_post_id (fast PK lookup).
        //      If already set, the post exists and we return it.
        //   2. Otherwise insert the post.
        //   3. Conditionally write feed_post_id back only WHERE
        //      feed_post_id IS NULL. The conditional eq() lets us detect
        //      whether someone else wrote first; if rows-affected is 0,
        //      we DELETE our just-inserted post and return their winner.
        //
        // This still races on small windows but the loser's row is
        // cleaned up rather than orphaned in the feed.
        const { data: streamWithFeedPost } = await supabase
            .from('live_streams')
            .select('feed_post_id, thumbnail_url, title, category, description')
            .eq('id', stream_id)
            .maybeSingle();

        if (streamWithFeedPost?.feed_post_id) {
            return res.json({
                success: true,
                postId: streamWithFeedPost.feed_post_id,
                duplicate: true,
            });
        }

        // Legacy fallback: existing post via JSONB scan (streams created
        // before feed_post_id existed). If we find one, write it back to
        // feed_post_id so subsequent calls take the fast path above.
        const { data: legacyMatch } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', user.id)
            .eq('content_type', 'live')
            .contains('metadata', { stream_id })
            .maybeSingle();

        if (legacyMatch) {
            await supabase
                .from('live_streams')
                .update({ feed_post_id: legacyMatch.id })
                .eq('id', stream_id)
                .is('feed_post_id', null);
            return res.json({ success: true, postId: legacyMatch.id, duplicate: true });
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

        if (postErr || !post) {
            console.warn('[create-live-post] insert error:', postErr?.message);
            return res.status(500).json({ error: 'Failed to create live post' });
        }

        // Conditional write-back: only update if feed_post_id is still NULL.
        // PostgREST returns the updated rows; if our row's feed_post_id was
        // already filled by a concurrent winner, the .is('feed_post_id',null)
        // filter excludes our row and the update returns nothing → we lost
        // the race and need to delete our orphan post.
        const { data: claimed } = await supabase
            .from('live_streams')
            .update({ feed_post_id: post.id })
            .eq('id', stream_id)
            .is('feed_post_id', null)
            .select('feed_post_id')
            .maybeSingle();

        if (!claimed) {
            // Someone else got there first. Clean up our orphan post and
            // return THEIR post id so the client gets a stable answer.
            await supabase.from('social_posts').delete().eq('id', post.id);
            const { data: winner } = await supabase
                .from('live_streams')
                .select('feed_post_id')
                .eq('id', stream_id)
                .maybeSingle();
            return res.json({
                success: true,
                postId: winner?.feed_post_id || null,
                duplicate: true,
            });
        }

        return res.json({ success: true, postId: post.id });
    } catch (err) {
        console.warn('[create-live-post] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
