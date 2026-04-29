/**
 * POST /api/live/end-stream
 * Server-side handler for post-stream actions: post to social feed, save as draft, or delete.
 * Uses service-role client to bypass RLS for reliable social_posts insert.
 *
 * Body: { stream_id, action: 'post'|'save'|'delete', caption? }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
            // Delete the stream record and any associated storage files
            if (stream.video_url) {
                const path = stream.video_url.split('/live-recordings/')[1];
                if (path) await supabase.storage.from('live-recordings').remove([path]).catch(() => {});
            }
            await supabase.from('live_streams').delete().eq('id', stream_id);
            return res.json({ success: true, action: 'deleted' });
        }

        if (action === 'save') {
            await supabase.from('live_streams').update({
                is_posted: false,
                is_draft: true,
            }).eq('id', stream_id);
            return res.json({ success: true, action: 'saved' });
        }

        if (action === 'post') {
            // Update stream record
            await supabase.from('live_streams').update({
                is_posted: true,
                is_draft: false,
            }).eq('id', stream_id);

            // Create social post via service role (bypasses RLS reliably)
            const { data: post, error: postErr } = await supabase.from('social_posts').insert({
                author_id: user.id,
                content: caption || `🔴 Live replay: ${stream.title || 'Stream'}`,
                content_type: 'video',
                media_urls: stream.video_url ? [stream.video_url] : [],
                thumbnail_url: stream.thumbnail_url || null,
                visibility: 'public',
                metadata: { stream_id, source: 'live_replay' },
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
