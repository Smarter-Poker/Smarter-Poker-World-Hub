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

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Update the live broadcast feed post to reflect stream-ended state.
 * Merges { ended: true } into the existing metadata JSONB without overwriting other fields.
 * Also updates thumbnail_url and media_urls with the final recording URL (if available).
 */
async function markFeedPostEnded(stream_id, videoUrl = null) {
    try {
        // Fetch the live post to get its current metadata
        const { data: livePost } = await supabase.from('social_posts')
            .select('id, metadata, media_urls')
            .eq('content_type', 'live')
            .contains('metadata', { stream_id })
            .maybeSingle();

        if (!livePost) return;

        const mergedMetadata = { ...(livePost.metadata || {}), ended: true };
        const updatePayload = { metadata: mergedMetadata };

        // If the replay video is available, update media_urls so the post shows the replay
        if (videoUrl) {
            const existingUrls = livePost.media_urls || [];
            // Replace thumbnail with replay video (or append if no thumbnail)
            updatePayload.media_urls = existingUrls.length > 0 ? [videoUrl] : [videoUrl];
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
            // Mark live feed post as ended before deleting stream record
            await markFeedPostEnded(stream_id);
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
            // Mark live feed post as ended — replay video URL replaces thumbnail in media_urls
            await markFeedPostEnded(stream_id, stream.video_url || null);

            // Update stream record — also keep as draft so it appears in live history
            await supabase.from('live_streams').update({
                is_posted: true,
                is_draft: true,
            }).eq('id', stream_id);

            // Create replay social post via service role (bypasses RLS reliably)
            const { data: post, error: postErr } = await supabase.from('social_posts').insert({
                author_id: user.id,
                content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
                content_type: 'video',
                media_urls: stream.video_url ? [stream.video_url] : [],
                thumbnail_url: stream.thumbnail_url || null,
                visibility: 'public',
                metadata: { stream_id, source: 'live_replay', lives_id: stream_id },
            }).select('id').maybeSingle();

            if (postErr) {
                console.warn('[end-stream] social_posts insert error:', postErr.message);
                return res.status(500).json({ error: 'Failed to create social post' });
            }

            return res.json({ success: true, action: 'posted', postId: post?.id });
        }

        return res.status(400).json({ error: 'Invalid action. Use: post, save, or delete' });
    } catch (err) {
        console.warn('[end-stream] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
