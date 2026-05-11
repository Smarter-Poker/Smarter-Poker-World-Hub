/**
 * POST /api/live/end-stream
 * Server-side handler for post-stream actions: post to social feed, save as draft, or delete.
 * Uses service-role client to bypass RLS for reliable social_posts insert.
 *
 * Body: { stream_id, action: 'post'|'save'|'delete', caption? }
 *
 * BUG FIX: For all actions, the corresponding live feed post (content_type='live')
 * is updated with metadata.ended = true so PostCard can render an "Ended" badge
 * instead of a pulsing "LIVE NOW" badge, while keeping content_type='live' so
 * the live card UI template is still used for replay access.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Update the live broadcast feed post to reflect stream-ended state.
 *
 * BUG-FIX-DEEP-AUDIT-R2 CSS-1: this used to do its own fetch + JSONB merge
 * in JS. It now defers to fn_mark_feed_post_ended (SECURITY DEFINER RPC)
 * which does the merge atomically in SQL. That eliminates a TOCTOU window
 * where a parallel writer could clobber a fresh JSONB merge between the
 * SELECT and the UPDATE here.
 *
 * The RPC handles both the FK fast path (live_streams.feed_post_id) and
 * the legacy JSONB-scan fallback. media_urls is still updated from this
 * handler when videoUrl is available, because the RPC doesn't know about
 * the recording URL.
 */
async function markFeedPostEnded(stream_id, videoUrl = null) {
    try {
        // Atomic merge of {ended: true} via SQL. Replaces the previous
        // {fetch, merge, update} sequence — see migration
        // 20260510235000 + 20260510235100 for the RPC definition.
        const { error: rpcErr } = await supabase
            .rpc('fn_mark_feed_post_ended', { p_stream_id: stream_id });
        if (rpcErr) {
            console.warn('[end-stream] fn_mark_feed_post_ended:', rpcErr.message);
            return;
        }

        // If we have a recording URL, write it into media_urls so the
        // post renders the replay video. This is a separate update from
        // the metadata merge — keeping them separate so a media_urls
        // failure can't block the metadata transition.
        if (videoUrl) {
            // Look up the post id (RPC didn't return it). FK fast path
            // first, JSONB fallback if needed.
            let postId = null;
            const { data: streamRow } = await supabase.from('live_streams')
                .select('feed_post_id')
                .eq('id', stream_id)
                .maybeSingle();
            postId = streamRow?.feed_post_id || null;

            if (!postId) {
                const { data: legacyMatch } = await supabase.from('social_posts')
                    .select('id')
                    .eq('content_type', 'live')
                    .contains('metadata', { stream_id })
                    .maybeSingle();
                postId = legacyMatch?.id || null;
            }

            if (postId) {
                await supabase.from('social_posts')
                    .update({ media_urls: [videoUrl] })
                    .eq('id', postId);
            }
        }
    } catch (e) {
        console.warn('[end-stream] markFeedPostEnded failed:', e?.message || e);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { stream_id, action, caption } = req.body;
    if (!stream_id || !action) return res.status(400).json({ error: 'stream_id and action required' });

    try {
        // Verify ownership
        const { data: stream } = await supabase
            .from('live_streams')
            .select('id, broadcaster_id, video_url, thumbnail_url, title')
            .eq('id', stream_id)
            .maybeSingle();

        if (!stream) return res.status(404).json({ error: 'Stream not found' });
        if (stream.broadcaster_id !== user.id) return res.status(403).json({ error: 'Not your stream' });

        if (action === 'delete') {
            // Delete live feed post instead of marking it ended to prevent ghost posts
            const { data: streamRow } = await supabase.from('live_streams').select('feed_post_id').eq('id', stream_id).maybeSingle();
            if (streamRow?.feed_post_id) {
                await supabase.from('social_posts').delete().eq('id', streamRow.feed_post_id);
            } else {
                await supabase.from('social_posts').delete().eq('content_type', 'live').contains('metadata', { stream_id });
            }
            // Delete the stream record and any associated storage files
            if (stream.video_url) {
                const path = stream.video_url.split('/live-recordings/')[1];
                if (path) await supabase.storage.from('live-recordings').remove([path]).catch(() => {});
            }
            await supabase.from('live_streams').delete().eq('id', stream_id);
            return res.json({ success: true, action: 'deleted' });
        }

        if (action === 'save') {
            // Mark live feed post as ended — stream is no longer live but saved privately
            await markFeedPostEnded(stream_id);
            await supabase.from('live_streams').update({
                is_posted: false,
                is_draft: true,
            }).eq('id', stream_id);
            return res.json({ success: true, action: 'saved' });
        }

        if (action === 'post') {
            // BUG FIX: Prevent duplicate posts by mutating the existing "live" post into a "video" post.
            const { data: streamRow } = await supabase.from('live_streams')
                .select('feed_post_id')
                .eq('id', stream_id)
                .maybeSingle();

            let postId = streamRow?.feed_post_id;
            let existingPost = null;

            if (postId) {
                const { data } = await supabase.from('social_posts').select('id, metadata').eq('id', postId).maybeSingle();
                existingPost = data;
            } else {
                const { data } = await supabase.from('social_posts').select('id, metadata').eq('content_type', 'live').contains('metadata', { stream_id }).maybeSingle();
                existingPost = data;
                if (existingPost) postId = existingPost.id;
            }

            if (existingPost) {
                const mergedMetadata = { ...(existingPost.metadata || {}), ended: true, source: 'live_replay', lives_id: stream_id };
                await supabase.from('social_posts').update({
                    content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
                    content_type: 'video', // Convert to video so it renders with video player
                    media_urls: stream.video_url ? [stream.video_url] : [],
                    thumbnail_url: stream.thumbnail_url || null,
                    metadata: mergedMetadata
                }).eq('id', postId);
            } else {
                // Fallback: create new if no live post was found
                const { data: post, error: postErr } = await supabase.from('social_posts').insert({
                    author_id: user.id,
                    content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
                    content_type: 'video',
                    media_urls: stream.video_url ? [stream.video_url] : [],
                    thumbnail_url: stream.thumbnail_url || null,
                    visibility: 'public',
                    metadata: { stream_id, ended: true, source: 'live_replay', lives_id: stream_id },
                }).select('id').maybeSingle();

                if (postErr) {
                    console.warn('[end-stream] social_posts insert error:', postErr.message);
                    return res.status(500).json({ error: 'Failed to create social post' });
                }
                postId = post?.id;
            }

            // Update stream record — is_draft must be FALSE when posting publicly
            await supabase.from('live_streams').update({
                is_posted: true,
                is_draft: false,
            }).eq('id', stream_id);

            return res.json({ success: true, action: 'posted', postId });
        }

        if (action === 'force_end') {
            // BUG FIX (#11): Called when broadcaster force-closes GoLiveModal without
            // going through EndStreamModal (tab close, crash, modal dismiss during live).
            // Ensures the live feed post badge transitions from "LIVE NOW" → "STREAM ENDED"
            // so it doesn't stay in a ghost-live state indefinitely.
            await markFeedPostEnded(stream_id);
            
            // BUG FIX (Sweep 3): Ensure the stream itself is marked ended in the DB.
            // Since the browser cancels the `await supabase.update` inside endBroadcast() during beforeunload,
            // this keepalive endpoint MUST handle the DB state change to prevent zombie live streams.
            await supabase.from('live_streams').update({
                status: 'ended',
                ended_at: new Date().toISOString(),
            }).eq('id', stream_id);
            
            return res.json({ success: true, action: 'force_ended' });
        }

        return res.status(400).json({ error: 'Invalid action. Use: post, save, delete, or force_end' });
    } catch (err) {
        console.warn('[end-stream] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
