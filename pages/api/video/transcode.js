/**
 * Queue an authenticated owned upload at the authoritative social post.
 * Qualified native Reels use the existing sp-transcode service; the maintained
 * generic upload consumer retains its other business work. Queue acknowledgment
 * is not completed encoding. The worker publishes H.264/AAC and a real preview;
 * existing H.264 media may use fast remux without a promised resolution change.
 * POST { videoUrl, postId }; identity comes from verified authentication.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { requireAuth } from '../../../src/lib/auth-middleware';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOwnedNativeUploadUrl(value, ownerId, configuredOrigin) {
    try {
        const url = new URL(value);
        const origin = new URL(configuredOrigin);
        if (!UUID.test(ownerId) || url.protocol !== 'https:' || origin.protocol !== 'https:'
            || url.origin !== origin.origin || origin.pathname !== '/' || origin.username || origin.password
            || origin.port || origin.search || origin.hash || url.username || url.password || url.port
            || url.search || url.hash || /[%\\]/.test(url.pathname)) return false;
        return new RegExp(`^/storage/v1/object/public/social-media/(?:videos|reels)/${ownerId}/[^/]+$`, 'i').test(url.pathname);
    } catch { return false; }
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'POST only' });
        }

        const user = await requireAuth(req, res);
        if (!user) return;

        const { videoUrl, postId } = req.body || {};

        if (typeof videoUrl !== 'string' || !UUID.test(String(postId || ''))) {
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

        if (!isOwnedNativeUploadUrl(videoUrl, user.id, supabaseUrl)) {
            return res.status(400).json({ success: false, error: 'Invalid owned upload URL' });
        }
        // The service-only RPC locks the owned post, proves primary-media
        // membership and queues the field consumed by the existing native worker.
        const { data, error } = await supabase.rpc('queue_owned_native_upload', {
            p_actor: user.id, p_post_id: postId, p_video_url: videoUrl,
        });
        if (error) {
            const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === '55000' ? 409 : 503;
            return res.status(status).json({ success: false, error: 'Native upload could not be queued' });
        }
        if (!data?.jobId || !['queued', 'running', 'done'].includes(data.status)) {
            return res.status(503).json({ success: false, error: 'Native queue acknowledgment unavailable' });
        }
        return res.status(200).json({ success: true, jobId: data.jobId, status: data.status, reused: data.reused === true });

    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.warn('[Transcode API] Error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
