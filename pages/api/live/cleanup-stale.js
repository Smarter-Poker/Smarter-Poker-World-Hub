/**
 * POST /api/live/cleanup-stale
 *
 * BUG-FIX-LIVE-LIST-8b: lazy stale-stream cleanup. Called from the
 * social-media feed page on mount as a poor-man's cron — every active
 * user pulling their feed sweeps any stale (timed-out) live streams to
 * status='ended'. Cheap, requires no dedicated infrastructure.
 *
 * Stale = status='live' AND no preview_updated_at activity in 60 seconds.
 * The broadcaster's StreamPreviewCapture uploads every ~25s while alive,
 * so a 60s gap means they're disconnected (lost connection / power /
 * closed app).
 *
 * Auto-saves recordings rather than deleting them — the recording is
 * preserved as a draft so the broadcaster can publish or discard it
 * later (matches the explicit 'save' action behavior).
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Rate limit so a malicious user can't hammer this. Read-class limit since
    // the work is small (single SQL call) and idempotent.
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // Auth required to prevent unauthenticated triggers — but any
    // authenticated user can call this (everyone wants stale streams gone).
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // 1. Find all currently-stale streams BEFORE we end them, so we can
        //    transition each one to 'saved' (draft) state preserving the
        //    recording. The fn_auto_end_stale_streams DB function ends them;
        //    we then walk the now-ended ones and mark them as drafts.
        const { data: stale } = await supabase
            .from('live_streams')
            .select('id, broadcaster_id, video_url, started_at, preview_updated_at')
            .eq('status', 'live')
            .lt('started_at', new Date(Date.now() - 60_000).toISOString());

        // Filter to those that are also stale by preview_updated_at threshold
        const trulyStale = (stale || []).filter(s => {
            if (!s.preview_updated_at) return true; // never had a preview update
            return new Date(s.preview_updated_at).getTime() < Date.now() - 60_000;
        });

        if (trulyStale.length === 0) {
            return res.json({ success: true, ended_count: 0 });
        }

        // 2. Use the SQL function to atomically end them all (server clock).
        const { data: rpcResult, error: rpcErr } = await supabase
            .rpc('fn_auto_end_stale_streams', { p_timeout_seconds: 60 });
        if (rpcErr) {
            console.warn('[live/cleanup-stale] RPC error:', rpcErr.message);
            return res.status(500).json({ error: rpcErr.message });
        }

        // 3. For each ended stream, mark its feed post as ended (badge
        //    transitions from "LIVE NOW" → "STREAM ENDED") and flip the
        //    stream into draft state so the recording is preserved.
        //
        // BUG-FIX-DEEP-AUDIT-R2 CSS-1: previously this did
        //   .update({ metadata: { stream_id, stream_status: 'ended' } })
        // which (a) overwrote the ENTIRE metadata JSONB and (b) used the
        // wrong key — PostCard at /hub/social-media checks metadata.ended,
        // not metadata.stream_status. So the "LIVE NOW" badge stayed on
        // every auto-cleaned stream forever. Now uses fn_mark_feed_post_ended
        // which atomically merges {ended: true} into the existing metadata.
        for (const s of trulyStale) {
            try {
                const { error: rpcErr2 } = await supabase
                    .rpc('fn_mark_feed_post_ended', { p_stream_id: s.id });
                if (rpcErr2) {
                    console.warn(`[live/cleanup-stale] fn_mark_feed_post_ended ${s.id}:`, rpcErr2.message);
                }

                // Auto-save: keep recording as draft (matches explicit 'save' action)
                await supabase
                    .from('live_streams')
                    .update({ is_posted: false, is_draft: true })
                    .eq('id', s.id);
            } catch (saveErr) {
                console.warn(`[live/cleanup-stale] auto-save failed for ${s.id}:`, saveErr.message);
                // Non-fatal — the row is still ended, just not saved as draft
            }
        }

        return res.json({
            success: true,
            ended_count: rpcResult?.ended_count ?? trulyStale.length,
            saved_count: trulyStale.length,
        });
    } catch (err) {
        console.error('[live/cleanup-stale] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
