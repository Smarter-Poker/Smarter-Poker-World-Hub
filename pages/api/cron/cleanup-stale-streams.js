/**
 * GET /api/cron/cleanup-stale-streams
 *
 * BUG-FIX-LIVE-LIST-8b backstop: cron-callable counterpart to
 * /api/live/cleanup-stale. The user-facing endpoint relies on the
 * social-media feed page-load as a "lazy cron" — every active user pulling
 * the feed sweeps stale streams. That works at peak hours but leaves a gap
 * at low-traffic times (e.g. 03:00 UTC) where streams that disconnect
 * without explicit `endStream` calls sit in `status='live'` for up to
 * 6 hours before the long-tail `cleanup_zombie_streams` job catches them.
 *
 * This endpoint closes that gap. Called every 5 minutes by Open Claw with
 * Authorization: Bearer ${CRON_SECRET}. Same DB function, same auto-save
 * draft logic, no auth.uid() requirement.
 *
 * Stale = status='live' AND no preview_updated_at activity in 300 seconds (5 min).
 * The broadcaster's StreamPreviewCapture uploads every ~25s while alive and
 * the LiveStreamService broadcaster heartbeat pings every 60s, so a 300s gap
 * means they're genuinely disconnected. Per Dan's mandate: never kill < 300s.
 */
import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // BUG-FIX-DEEP-AUDIT-R3 L-3: prune live_viewers rows older than 5
        // minutes since last_seen_at. Heartbeats from named viewers refresh
        // last_seen_at every ~30s via LiveStreamService. A 5-minute timeout
        // is enough margin for short cellular dropouts but catches tab
        // crashes / force-quits. Runs alongside the stream-cleanup below
        // since both share the same 5-minute schedule. Non-fatal: failures
        // don't block the stream cleanup that this endpoint primarily
        // exists for.
        let viewersDeleted = 0;
        try {
            const { data: vResult, error: vErr } = await supabase
                .rpc('fn_cleanup_stale_viewers', { p_timeout_minutes: 5 });
            if (vErr) {
                console.warn('[cron/cleanup-stale-streams] fn_cleanup_stale_viewers:', vErr.message);
            } else {
                viewersDeleted = vResult?.deleted_count ?? 0;
            }
        } catch (vThrow) {
            console.warn('[cron/cleanup-stale-streams] fn_cleanup_stale_viewers threw:',
                vThrow?.message || vThrow);
        }

        // 1. Snapshot stale streams BEFORE we end them so we can flip each
        //    one to is_draft=true (preserving recordings, matching the
        //    explicit 'save' action).
        const cutoffIso = new Date(Date.now() - 300_000).toISOString();
        const { data: stale, error: scanErr } = await supabase
            .from('live_streams')
            .select('id, broadcaster_id, video_url, started_at, preview_updated_at')
            .eq('status', 'live')
            .lt('started_at', cutoffIso);

        if (scanErr) {
            console.warn('[cron/cleanup-stale-streams] scan error:', scanErr.message);
            return res.status(500).json({ error: scanErr.message });
        }

        const trulyStale = (stale || []).filter(s => {
            if (!s.preview_updated_at) return true; // never had a preview update
            return new Date(s.preview_updated_at).getTime() < Date.now() - 300_000;
        });

        if (trulyStale.length === 0) {
            return res.json({
                success: true,
                ended_count: 0,
                saved_count: 0,
                viewers_deleted: viewersDeleted,
                timestamp: new Date().toISOString(),
            });
        }

        // 2. Atomically end them via the DB function. Server clock decides
        //    'now', so all rows get a consistent ended_at.
        const { data: rpcResult, error: rpcErr } = await supabase
            .rpc('fn_auto_end_stale_streams', { p_timeout_seconds: 300 });

        if (rpcErr) {
            console.warn('[cron/cleanup-stale-streams] RPC error:', rpcErr.message);
            return res.status(500).json({ error: rpcErr.message });
        }

        // 3. For each ended stream:
        //    - Mark its feed post as 'ended' (badge transitions LIVE NOW → STREAM ENDED)
        //    - Flip the live_streams row to is_draft=true so the recording is
        //      preserved as a draft (matches explicit 'save' action behavior)
        //
        // BUG-FIX-DEEP-AUDIT-R2 CSS-1: was previously
        //   .update({ metadata: { stream_id, stream_status: 'ended' } })
        // which (a) overwrote the entire metadata JSONB and (b) used the
        // wrong key — PostCard checks metadata.ended. Auto-cleaned streams
        // stayed stuck on "LIVE NOW" badge. Now uses fn_mark_feed_post_ended
        // which atomically merges {ended: true} into existing metadata.
        let savedCount = 0;
        for (const s of trulyStale) {
            try {
                const { error: rpcErr2 } = await supabase
                    .rpc('fn_mark_feed_post_ended', { p_stream_id: s.id });
                if (rpcErr2) {
                    console.warn(`[cron/cleanup-stale-streams] fn_mark_feed_post_ended ${s.id}:`, rpcErr2.message);
                }

                await supabase
                    .from('live_streams')
                    .update({ is_posted: false, is_draft: true })
                    .eq('id', s.id);

                savedCount += 1;
            } catch (saveErr) {
                console.warn(
                    `[cron/cleanup-stale-streams] auto-save failed for ${s.id}:`,
                    saveErr.message
                );
                // Non-fatal — the stream row is still ended, just not saved as draft
            }
        }

        return res.json({
            success: true,
            ended_count: rpcResult?.ended_count ?? trulyStale.length,
            saved_count: savedCount,
            viewers_deleted: viewersDeleted,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[cron/cleanup-stale-streams] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
