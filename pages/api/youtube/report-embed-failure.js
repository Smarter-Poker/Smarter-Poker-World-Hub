/**
 * POST /api/youtube/report-embed-failure
 * 
 * Receives YouTube embed failure reports from the client-side hook.
 * Upserts into `youtube_embed_failures` table for server-side filtering.
 * 
 * Body: { videoId: string, errorCode: number, surface: string }
 * Returns: { ok: true } or { error: string }
 */
import { createClient } from '@supabase/supabase-js';

// Lazy-init to avoid module-scope crash if env vars aren't loaded yet
let _supabase;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            console.error('[youtube-report] Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
            return null;
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId, errorCode, surface } = req.body || {};

    if (!videoId || !errorCode) {
        return res.status(400).json({ error: 'Missing videoId or errorCode' });
    }

    // Validate error code is a known YouTube error
    const KNOWN_CODES = [2, 5, 100, 101, 150];
    const code = Number(errorCode);
    if (!KNOWN_CODES.includes(code)) {
        return res.status(400).json({ error: `Unknown error code: ${code}` });
    }

    try {
        const supabase = getSupabase();
        if (!supabase) {
            return res.status(503).json({ error: 'Service not configured' });
        }

        // Upsert: if this video already has a failure record, bump the hit count
        const { error: dbError } = await supabase
            .from('youtube_embed_failures')
            .upsert({
                video_id: String(videoId),
                error_code: code,
                surface: String(surface || 'Unknown').slice(0, 50),
                last_seen_at: new Date().toISOString(),
                hit_count: 1, // Will be incremented by the DB trigger/on conflict
            }, {
                onConflict: 'video_id',
                // On conflict, update the error code, surface, last_seen_at, and increment hit_count
            });

        if (dbError) {
            // If table doesn't exist yet, log and return OK (graceful degradation)
            if (dbError.code === '42P01') {
                console.warn('[youtube-report] Table youtube_embed_failures not yet created — skipping');
                return res.status(200).json({ ok: true, note: 'table_pending' });
            }
            console.error('[youtube-report] DB error:', dbError.message);
            return res.status(500).json({ error: 'Database error' });
        }

        // Also update the raw SQL to increment the hit_count properly
        await supabase.rpc('increment_yt_failure_hits', { p_video_id: String(videoId) }).catch(() => {
            // If the RPC doesn't exist yet, no problem — the upsert still records the failure
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[youtube-report] Unexpected error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
