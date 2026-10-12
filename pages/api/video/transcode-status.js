/**
 * GET /api/video/transcode-status?postId=xxx
 * Returns the transcode job status for a given post.
 * Used by the client to poll transcoding progress after upload.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'GET only' });
        }

        const user = await requireAuth(req, res);
        if (!user) return;

        const { postId } = req.query;
        if (!UUID.test(String(postId || ''))) {
            return res.status(400).json({ success: false, error: 'Missing postId' });
        }

        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // Observe the same owned post fields consumed/written by sp-transcode.
        // A queued orphan job row is not evidence that native work is running.
        const { data: post, error } = await supabase.from('social_posts')
            .select('id,author_id,transcode_status,transcode_error,media_urls,original_media_url')
            .eq('id', postId).eq('author_id', user.id).eq('is_deleted', false).maybeSingle();
        if (error) return res.status(503).json({ success: false, error: 'Native status unavailable' });
        if (!post) return res.status(404).json({ success: false, error: 'Owned post not found' });
        const states = { queued: 'queued', running: 'processing', done: 'completed', failed: 'failed' };
        const status = states[post.transcode_status];
        return res.status(200).json({ success: true, job: status ? {
            id: `native:${post.id}`, status, progress: status === 'completed' ? 100 : null,
            output_url: status === 'completed' ? post.media_urls?.[0] || null : null,
            error_message: status === 'failed' ? 'Native processing failed' : null,
        } : null });

    } catch (err) {
        console.warn('[Transcode Status] Error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
