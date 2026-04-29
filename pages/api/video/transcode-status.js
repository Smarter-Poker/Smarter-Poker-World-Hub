/**
 * GET /api/video/transcode-status?postId=xxx
 * Returns the transcode job status for a given post.
 * Used by the client to poll transcoding progress after upload.
 */

import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../../../src/lib/auth-middleware';

const TRANSCODE_TABLE = 'video_transcode_jobs';

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'GET only' });
        }

        const user = await requireAuth(req, res);
        if (!user) return;

        const { postId } = req.query;
        if (!postId) {
            return res.status(400).json({ success: false, error: 'Missing postId' });
        }

        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!supabaseUrl || !serviceKey) {
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // Get the latest transcode job for this post
        const { data: job, error } = await supabase
            .from(TRANSCODE_TABLE)
            .select('id, status, progress, output_url, error_message, created_at, updated_at')
            .eq('post_id', postId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            // Table might not exist — return graceful 'no job' state
            return res.status(200).json({
                success: true,
                job: null,
                message: 'No transcode job found (table may not exist)',
            });
        }

        return res.status(200).json({
            success: true,
            job: job || null,
        });

    } catch (err) {
        console.warn('[Transcode Status] Error:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
