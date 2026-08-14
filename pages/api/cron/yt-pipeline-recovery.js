/**
 * /api/cron/yt-pipeline-recovery — Open Claw auto-recovery for YouTube pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Fired by openclaw-cron-dispatcher every 6 hours.
 *
 * Re-queues video_transcode_jobs that failed with cookie-auth or transient
 * patterns so the worker retries them with the current stack:
 *   - bgutil-pot-provider POT tokens (no Google login)
 *   - player_client=tv,web_safari,mweb,web_embedded (looser bot detection)
 *   - player_skip=webpage,configs (no HTML fingerprinting)
 *
 * Most cookie-auth failures from earlier weeks will now succeed because the
 * pipeline no longer depends on cookies for ~95% of content. The remaining
 * failures will surface as permanent (age-restricted) and stay marked.
 *
 * Safety:
 *   - Caps re-queue to 200 jobs per fire to avoid stampede
 *   - Skips jobs created in the last 1h (worker may still be retrying them)
 *   - Skips jobs already attempted >= 5 times (give up — too noisy)
 *   - Idempotent: setting status='queued' on an already-queued job is a no-op
 *
 * Returns: { status, requeued, scanned, sample_ids }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _admin = null;
function getAdmin() {
    if (_admin) return _admin;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _admin = createClient(url, key, { auth: { persistSession: false } });
    return _admin;
}

export const config = { maxDuration: 60 };

// 2026-05-13 v2: cadence flipped from */2h to */15min. With only ~162
// unique queueable URLs in the entire system and 3-min avg per job, the
// worker drains the queue in minutes. Frequent small cron fires keep the
// queue topped up continuously instead of draining and waiting 2h.
// CAP stays at 1000 (would re-queue everything in one fire anyway).
const REQUEUE_CAP = 1000;

// Failure patterns that are now likely-recoverable thanks to PR #523's POT stack.
// We DON'T include 'filtered_too_long_or_large' (legitimate filter) or
// 'PRIVATE_VIDEO' / 'VIDEO_UNAVAILABLE' / 'age-restricted' patterns (permanent).
const RECOVERABLE_PATTERNS = [
    'from-browser or --cookies for the authentication',
    'Use --cookies-from-browser',
    'Sign in to confirm',
    'rate-limited by YouTube',
    'yt-dlp_exit_null',
    'yt-dlp_spawn',
    'ffmpeg_timeout_',
    'yt-dlp_timeout_',
    'ffmpeg_exit_255',
    'Bad Gateway',
];

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    const started = Date.now();
    let scanned = 0;
    let requeued = 0;
    const sampleIds = [];

    let permanentlyHidden = 0;

    try {
        // PHASE 0: auto-mark permanent-failure reels is_public=false so
        // they stop showing in /hub/reels. These are videos that can never
        // be transcoded by ANY pipeline (geo-blocked, members-only,
        // private, removed from YouTube).
        try {
            const { data: permJobs } = await admin
                .from('video_transcode_jobs')
                .select('reel_id, error_message')
                .eq('status', 'failed')
                .or([
                    'error_message.ilike.%uploader has not made%',
                    'error_message.ilike.%available to this channel%',
                    'error_message.ilike.%Private video%',
                    'error_message.ilike.%video is unavailable%',
                ].join(','))
                .limit(500);
            if (permJobs && permJobs.length) {
                const ids = [...new Set(permJobs.map(j => j.reel_id).filter(Boolean))];
                if (ids.length) {
                    const { count } = await admin
                        .from('social_reels')
                        .update({ is_public: false })
                        .in('id', ids)
                        .eq('is_public', true)
                        .select('id', { count: 'exact', head: true });
                    permanentlyHidden = count || 0;
                }
            }
        } catch (e) { /* non-fatal */ }

        // Build the OR clause: error_message ILIKE any-of-recoverable
        const orClause = RECOVERABLE_PATTERNS
            .map(p => `error_message.ilike.%${p.replace(/[%,()]/g, '_')}%`)
            .join(',');

        const { data: candidates, error: selectErr } = await admin
            .from('video_transcode_jobs')
            .select('id, reel_id, attempts, error_message, updated_at')
            .eq('status', 'failed')
            .or(orClause)
            .lt('updated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())  // older than 1h
            .lt('attempts', 5)                                                       // hard cap on retries
            .order('updated_at', { ascending: true })
            .limit(REQUEUE_CAP);

        if (selectErr) {
            return res.status(500).json({ status: 'failed', stage: 'select', error: selectErr.message });
        }

        scanned = (candidates || []).length;

        if (scanned > 0) {
            // Requeue AND increment attempts (audit 2026-08-14). Until now
            // nothing anywhere incremented `attempts`, so the `.lt('attempts', 5)`
            // retry cap above could never bind — a permanently-broken job that
            // dodged the "permanent failure" patterns would requeue forever at
            // 1-hour spacing. supabase-js has no atomic increment on update, so
            // group ids by their CURRENT attempts value (already loaded in the
            // select) — at most 5 groups under the cap — one update per group.
            const byAttempts = new Map();
            for (const c of candidates) {
                const a = Number(c.attempts) || 0;
                if (!byAttempts.has(a)) byAttempts.set(a, []);
                byAttempts.get(a).push(c.id);
            }
            for (const [a, ids] of byAttempts) {
                const { error: updateErr } = await admin
                    .from('video_transcode_jobs')
                    .update({
                        status: 'queued',
                        error_message: null,
                        worker_id: null,
                        locked_at: null,
                        attempts: a + 1,
                    })
                    .in('id', ids);
                if (updateErr) {
                    return res.status(500).json({
                        status: 'failed', stage: 'update', error: updateErr.message,
                        scanned, requeued,
                    });
                }
                requeued += ids.length;
                sampleIds.push(...ids.slice(0, 5 - sampleIds.length));
            }
        }

        // Best-effort heartbeat — don't fail the response on heartbeat error.
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'yt-pipeline-recovery',
                metadata: { requeued, scanned, permanentlyHidden, duration_ms: Date.now() - started },
            });
        } catch (_) { /* heartbeats table may not exist on all envs */ }

        return res.status(200).json({
            status: 'ok',
            requeued,
            permanentlyHidden,
            scanned,
            sample_ids: sampleIds,
            duration_ms: Date.now() - started,
        });
    } catch (err) {
        return res.status(500).json({
            status: 'failed', stage: 'unexpected',
            error: err.message, scanned, requeued,
        });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('yt-pipeline-recovery', handler);
