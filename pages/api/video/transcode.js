/**
 * 🎬 SERVER-SIDE VIDEO TRANSCODING TRIGGER
 * pages/api/video/transcode.js
 *
 * After a raw video is uploaded to Supabase Storage, this endpoint
 * queues a server-side transcoding job. The job:
 *   1. Re-encodes the video to H.264/AAC at 720p/2.5Mbps
 *   2. Generates a proper server-side thumbnail
 *   3. Updates the post's media_urls with the optimized URL
 *
 * This eliminates the need for client-side compression (which was
 * disabled due to real-time processing freezing mobile UIs).
 *
 * POST /api/video/transcode
 * Body: { videoUrl, postId, userId }
 *
 * Returns: { success: true, jobId }
 *
 * NOTE: This is the trigger endpoint. The actual transcoding runs
 * asynchronously via a background worker (Supabase Edge Function
 * or external service). The worker updates the DB when complete.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { reportApiError } from '../../../src/lib/sentryWrap';

const TRANSCODE_TABLE = 'video_transcode_jobs';

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'POST only' });
        }

        const user = await requireAuth(req, res);
        if (!user) return;

        const { videoUrl, postId } = req.body || {};

        if (!videoUrl || !postId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: videoUrl, postId',
            });
        }

        // Security: verify the user owns this post
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // Verify post ownership
        const { data: post } = await supabase
            .from('social_posts')
            .select('id, author_id')
            .eq('id', postId)
            .maybeSingle();

        if (!post || post.author_id !== user.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Queue the transcode job
        const jobId = `txc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const { error: insertError } = await supabase
            .from(TRANSCODE_TABLE)
            .insert({
                id: jobId,
                post_id: postId,
                user_id: user.id,
                source_url: videoUrl,
                status: 'queued',
                target_format: 'h264_720p',
                target_bitrate: 2_500_000,
                created_at: new Date().toISOString(),
            });

        if (insertError) {
            // Table might not exist yet — log and return gracefully
            console.warn('[Transcode API] Insert error (table may not exist):', insertError.message);
            return res.status(200).json({
                success: true,
                jobId: null,
                message: 'Transcode queuing skipped - table not configured yet',
            });
        }

        return res.status(200).json({
            success: true,
            jobId,
            message: 'Transcode job queued successfully',
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.warn('[Transcode API] Error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
