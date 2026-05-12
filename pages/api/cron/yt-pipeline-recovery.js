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

const REQUEUE_CAP = 200;

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

export default async function handler(req, res) {
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

    try {
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
            const ids = candidates.map(c => c.id);
            const { error: updateErr } = await admin
                .from('video_transcode_jobs')
                .update({
                    status: 'queued',
                    error_message: null,
                    worker_id: null,
                    locked_at: null,
                })
                .in('id', ids);
            if (updateErr) {
                return res.status(500).json({
                    status: 'failed', stage: 'update', error: updateErr.message,
                    scanned, requeued: 0,
                });
            }
            requeued = ids.length;
            sampleIds.push(...ids.slice(0, 5));
        }

        // Best-effort heartbeat — don't fail the response on heartbeat error.
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'yt-pipeline-recovery',
                metadata: { requeued, scanned, duration_ms: Date.now() - started },
            });
        } catch (_) { /* heartbeats table may not exist on all envs */ }

        return res.status(200).json({
            status: 'ok',
            requeued,
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
