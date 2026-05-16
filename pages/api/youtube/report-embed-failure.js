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

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
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
            console.error('[youtube-report] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
            return res.status(503).json({ error: 'Service not configured' });
        }

        // Upsert: if this video already has a failure record, update last_seen_at
        // NOTE: Do NOT include hit_count — the RPC below handles incrementing.
        // Including it would reset hit_count to 1 on every repeat report.
        const { error: dbError } = await supabase
            .from('youtube_embed_failures')
            .upsert({
                video_id: String(videoId),
                error_code: code,
                surface: String(surface || 'Unknown').slice(0, 50),
                last_seen_at: new Date().toISOString(),
            }, {
                onConflict: 'video_id',
                ignoreDuplicates: false,
            });

        if (dbError) {
            // If table doesn't exist yet, log and return OK (graceful degradation)
            if (dbError.code === '42P01') {
                console.warn('[youtube-report] Table youtube_embed_failures not yet created — skipping');
                return res.status(200).json({ ok: true, note: 'table_pending' });
            }
            console.error('[youtube-report] DB error:', dbError.message, dbError.code);
            return res.status(200).json({ ok: true, note: 'logged_error' });
        }

        // Increment the hit_count via RPC (best-effort, handles existing records)
        const { error: rpcErr } = await supabase.rpc('increment_yt_failure_hits', { p_video_id: String(videoId) });
        if (rpcErr) console.warn('[youtube] rpc error:', rpcErr.message);

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[youtube-report] Unexpected error:', err.message, err.stack);
        // Return 200 to prevent client retries — this is telemetry, not critical
        return res.status(200).json({ ok: true, note: 'error_logged' });
    }
}
