/**
 * POST /api/live/share-stream-to-feed
 *
 * BUG-FIX-LIVE-LIST-7: Watcher-side share. Creates a social_posts row on
 * the caller's feed referencing a live stream they're watching. Lets
 * viewers re-broadcast the stream into their own followers' feeds while
 * it's live.
 *
 * Body: { stream_id, commentary }
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

    const { stream_id, commentary } = req.body;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    // Cap commentary at 500 chars to match the standard post-share cap
    const trimmedCommentary = typeof commentary === 'string' ? commentary.trim().slice(0, 500) : '';

    try {
        // Fetch stream metadata + broadcaster profile for the post card
        const { data: stream, error: streamErr } = await supabase
            .from('live_streams')
            .select('id, broadcaster_id, title, thumbnail_url, preview_clip_url, status, profiles!broadcaster_id(username, full_name)')
            .eq('id', stream_id)
            .maybeSingle();

        if (streamErr || !stream) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        const streamLink = `https://smarter.poker/hub/social-media?stream=${stream_id}`;

        // Duplicate guard — don't let the same user share the same stream twice
        const { data: existing } = await supabase
            .from('social_posts')
            .select('id')
            .eq('author_id', user.id)
            .eq('link_url', streamLink)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.json({ success: true, already_shared: true, postId: existing[0].id });
        }

        const broadcasterName = stream.profiles?.username || stream.profiles?.full_name || 'a broadcaster';
        const liveLabel = stream.status === 'live' ? '🔴 LIVE' : '📼 Replay';
        const titleLine = stream.title ? `"${stream.title}"` : '';

        const parts = [];
        if (trimmedCommentary) parts.push(trimmedCommentary);
        parts.push(`${liveLabel} — Watching @${broadcasterName} ${titleLine}`.trim());
        parts.push(streamLink);
        const postContent = parts.join('\n\n');

        // Insert the social_posts row. content_type='shared' to match the
        // existing share-to-feed pattern; metadata.stream_id lets the feed
        // renderer identify it as a stream share for richer rendering.
        const { data: post, error: insertErr } = await supabase
            .from('social_posts')
            .insert({
                author_id: user.id,
                content: postContent,
                content_type: 'shared',
                media_urls: stream.thumbnail_url ? [stream.thumbnail_url] : [],
                visibility: 'public',
                link_url: streamLink,
                metadata: {
                    shared_stream_id: stream_id,
                    shared_from: 'live_viewer_share',
                    broadcaster_id: stream.broadcaster_id,
                    broadcaster_name: broadcasterName,
                    stream_title: stream.title,
                    stream_thumbnail: stream.thumbnail_url,
                    stream_preview_clip: stream.preview_clip_url,
                    stream_status_at_share: stream.status,
                },
            })
            .select('id')
            .maybeSingle();

        if (insertErr) {
            console.warn('[share-stream-to-feed] Insert error:', insertErr.message);
            // Handle trigger errors gracefully — the post may have been created
            // before the trigger threw, so check.
            if (insertErr.message?.includes('trigger procedure')) {
                const { data: check } = await supabase
                    .from('social_posts')
                    .select('id')
                    .eq('author_id', user.id)
                    .eq('link_url', streamLink)
                    .limit(1);
                if (check && check.length > 0) {
                    return res.json({ success: true, postId: check[0].id, trigger_warning: true });
                }
            }
            return res.status(500).json({ error: insertErr.message });
        }

        return res.json({ success: true, postId: post?.id });
    } catch (err) {
        console.error('[share-stream-to-feed] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
