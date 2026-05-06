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
 * Merges { ended: true } into the existing metadata JSONB without overwriting other fields.
 * Also updates media_urls with the final recording URL (if available).
 *
 * Strategy: use feed_post_id FK (direct O(1) PK lookup) stored on live_streams.
 * Fall back to metadata JSONB contains() scan for streams created before feed_post_id existed.
 */
async function markFeedPostEnded(stream_id, videoUrl = null) {
    try {
        // BUG FIX (#10): Use feed_post_id stored on the stream row for a direct PK lookup.
        // The old code used .contains('metadata', { stream_id }) which is a slow JSONB scan
        // and silently returns null if the JSON key is missing or the index is stale.
        const { data: streamRow } = await supabase.from('live_streams')
            .select('feed_post_id')
            .eq('id', stream_id)
            .maybeSingle();

        let livePost = null;

        if (streamRow?.feed_post_id) {
            // Fast path: direct PK lookup via stored FK
            const { data } = await supabase.from('social_posts')
                .select('id, metadata, media_urls')
                .eq('id', streamRow.feed_post_id)
                .maybeSingle();
            livePost = data;
        }

        if (!livePost) {
            // Fallback: JSONB scan (for streams created before feed_post_id column existed)
            const { data } = await supabase.from('social_posts')
                .select('id, metadata, media_urls')
                .eq('content_type', 'live')
                .contains('metadata', { stream_id })
                .maybeSingle();
            livePost = data;
        }

        if (!livePost) return; // No live post to update — silently skip

        const mergedMetadata = { ...(livePost.metadata || {}), ended: true };
        const updatePayload = { metadata: mergedMetadata };

        // If the replay video is available, update media_urls so the post shows the replay
        if (videoUrl) {
            updatePayload.media_urls = [videoUrl];
        }

        await supabase.from('social_posts')
            .update(updatePayload)
            .eq('id', livePost.id);
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
