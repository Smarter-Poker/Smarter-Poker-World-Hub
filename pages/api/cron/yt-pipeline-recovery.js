/**
 * /api/cron/yt-pipeline-recovery — Open Claw auto-recovery for YouTube pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Fired by openclaw-cron-dispatcher every 15 minutes.
 *
 * Re-queues rights-cleared YouTube video_transcode_jobs that failed with
 * bounded infrastructure failures. Cookie login and local proof-token services
 * are retired: authentication/restriction failures are never auto-requeued.
 *
 * Safety:
 *   - Fails closed unless both job and Reel explicitly say owned/licensed
 *   - Requires the linked Reel to still request native processing
 *   - Caps re-queue to 1,000 jobs per fire and updates in safe chunks
 *   - Skips jobs created in the last 1h (worker may still be retrying them)
 *   - Skips jobs already attempted >= 5 times (give up — too noisy)
 *   - Compare-and-set: only the exact failed attempt selected by this run moves
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

async function loadNativeControl(admin) {
    const { data, error } = await admin
        .from('video_reels_pipeline_controls')
        .select('control_key,enabled,updated_at')
        .eq('control_key', 'youtube_native_transcode')
        .maybeSingle();
    if (error || !data) return { state: 'indeterminate', error };
    return { state: data.enabled === true ? 'enabled' : 'disabled', data };
}

export const config = { maxDuration: 60 };

// 2026-05-13 v2: cadence flipped from */2h to */15min. With only ~162
// unique queueable URLs in the entire system and 3-min avg per job, the
// worker drains the queue in minutes. Frequent small cron fires keep the
// queue topped up continuously instead of draining and waiting 2h.
// CAP stays at 1000 (would re-queue everything in one fire anyway).
const REQUEUE_CAP = 1000;
const NATIVE_PROCESSING_RIGHTS = ['owned', 'licensed'];
const POSTGREST_IN_CHUNK = 100;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

function extractYouTubeId(value) {
    const raw = String(value || '').trim();
    if (YOUTUBE_ID_RE.test(raw)) return raw;
    try {
        const parsed = new URL(raw);
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) return null;
        const host = parsed.hostname.toLowerCase();
        let id = null;
        if (host === 'youtu.be') id = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
        else if (YOUTUBE_HOSTS.has(host)) {
            if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
            else id = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
        } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
            id = parsed.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
        }
        return YOUTUBE_ID_RE.test(id || '') ? id : null;
    } catch (_) {
        return null;
    }
}

function isRecoveryCandidateAuthorized(job, reel) {
    const youtubeId = extractYouTubeId(job?.youtube_url);
    return Boolean(
        youtubeId
        && UUID_RE.test(job?.id || '')
        && UUID_RE.test(job?.reel_id || '')
        && reel?.id === job.reel_id
        && UUID_RE.test(job.user_id || '')
        && UUID_RE.test(reel.author_id || '')
        && UUID_RE.test(reel.source_post_id || '')
        && (!job.source_asset_id || UUID_RE.test(job.source_asset_id))
        && (!reel.source_asset_id || UUID_RE.test(reel.source_asset_id))
        && !reel.is_deleted
        && reel.native_processing_requested === true
        && NATIVE_PROCESSING_RIGHTS.includes(job.rights_status)
        && reel.rights_status === job.rights_status
        && job.user_id === reel.author_id
        && job.source_type === 'youtube'
        && reel.source_type === 'youtube'
        && reel.origin_type !== 'video_library'
        && job.origin_type === reel.origin_type
        && (job.source_asset_id || null) === (reel.source_asset_id || null)
        && extractYouTubeId(job.source_url) === youtubeId
        && extractYouTubeId(reel.video_url) === youtubeId
        && extractYouTubeId(reel.original_youtube_url) === youtubeId
        && reel.youtube_video_id === youtubeId
        && job.canonical_asset_key === `youtube:${youtubeId}`
        && reel.canonical_asset_key === `youtube:${youtubeId}`
        && reel.source_post_id
    );
}

// Only infrastructure failures are retryable. Cookie/login/POT recovery was
// retired; treating access challenges as transient would create doomed work.
const RECOVERABLE_PATTERNS = [
    'rate-limited by YouTube',
    // Unknown extractor exits are bounded by attempts < 5. Terminal access,
    // duration, and size failures retire native_processing_requested in the
    // worker and therefore cannot pass the immutable Reel re-attestation.
    'yt-dlp_exit_',
    'yt-dlp_spawn',
    'ffmpeg_timeout_',
    'yt-dlp_timeout_',
    'ffmpeg_exit_255',
    'Bad Gateway',
];

// yt-dlp wraps both infrastructure and permanent access failures in exit 1.
// The broad bounded retry above is therefore paired with an explicit terminal
// deny-list before any job can be requeued. Keep this vocabulary aligned with
// the worker's PERMANENT_PATTERNS; matching is case-insensitive.
const TERMINAL_FAILURE_PATTERNS = [
    'video unavailable',
    'this video is private',
    'this video has been removed',
    'removed by the uploader',
    'this live event will begin',
    'age-restricted',
    'members-only',
    "available to this channel's members",
    'copyright claim',
    'use --cookies-from-browser or --cookies',
    'from-browser or --cookies for the authentication',
    'authentication required',
    'login required',
    'sign in to confirm',
    'not available in your country',
    'use a vpn or a proxy server',
    'filtered_too_long_or_large',
    'raw_too_large_',
    'output_too_large_',
];

function isTerminalFailure(message) {
    const normalized = String(message || '').toLowerCase();
    return TERMINAL_FAILURE_PATTERNS.some(pattern => normalized.includes(pattern));
}

async function requeueFailedJobs(admin, ids, attempts) {
    const update = targetIds => admin
        .from('video_transcode_jobs')
        .update({
            status: 'queued',
            error_message: null,
            worker_id: null,
            claim_token: null,
            started_at: null,
            completed_at: null,
            locked_at: null,
            heartbeat_at: new Date().toISOString(),
            attempts: attempts + 1,
        })
        .in('id', targetIds)
        .eq('status', 'failed')
        .eq('attempts', attempts)
        .select('id');

    const bulk = await update(ids);
    if (!bulk.error || bulk.error.code !== '23505' || ids.length === 1) return bulk;

    // A canonical-key insert can win after the live-job precheck. Isolate that
    // benign race instead of rolling back every unrelated row in the chunk.
    const rows = [];
    for (const id of ids) {
        const single = await update([id]);
        if (single.error?.code === '23505') continue;
        if (single.error) return { data: rows, error: single.error };
        rows.push(...(single.data || []));
    }
    return { data: rows, error: null };
}

async function handler(req, res) {
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const admin = getAdmin();
    if (!admin) {
        return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
    }

    // This legacy recovery route cannot be allowed to manufacture work behind
    // an operator-disabled native pipeline. Read the database switch before
    // any Reel/job mutation and fail closed if the control row is unavailable.
    const nativeControl = await loadNativeControl(admin);
    if (nativeControl.state === 'indeterminate') {
        return res.status(503).json({
            status: 'control_unavailable',
            error: nativeControl.error?.message || 'youtube_native_transcode control is missing',
            scanned: 0,
            requeued: 0,
        });
    }
    if (nativeControl.state !== 'enabled') {
        return res.status(200).json({
            status: 'disabled',
            control: 'youtube_native_transcode',
            scanned: 0,
            requeued: 0,
            permanently_hidden: 0,
        });
    }

    const started = Date.now();
    let scanned = 0;
    let requeued = 0;
    const sampleIds = [];

    try {
        // Embed availability and public visibility belong exclusively to the
        // trusted availability verifier. A transcode error is not authority to
        // hide a Reel, so this route only performs failed-job recovery.

        // Build the OR clause: error_message ILIKE any-of-recoverable
        const orClause = RECOVERABLE_PATTERNS
            .map(p => `error_message.ilike.%${p.replace(/[%,()]/g, '_')}%`)
            .join(',');

        const { data: candidates, error: selectErr } = await admin
            .from('video_transcode_jobs')
            .select('id, reel_id, user_id, attempts, error_message, updated_at, youtube_url, source_url, source_type, rights_status, origin_type, source_asset_id, canonical_asset_key')
            .eq('status', 'failed')
            .eq('source_type', 'youtube')
            .in('rights_status', NATIVE_PROCESSING_RIGHTS)
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
            // Re-check the linked Reel immediately before changing job state.
            // A rights grant can be revoked or native processing can be
            // switched off after the failed job was created. Job metadata by
            // itself is therefore never sufficient authority to download.
            const reelsById = new Map();
            const candidateReelIds = [...new Set(
                candidates.map(candidate => candidate.reel_id).filter(Boolean)
            )];
            for (let i = 0; i < candidateReelIds.length; i += POSTGREST_IN_CHUNK) {
                const { data: reels, error: reelSelectErr } = await admin
                    .from('social_reels')
                    .select('id,author_id,rights_status,native_processing_requested,is_deleted,source_type,origin_type,source_asset_id,canonical_asset_key,youtube_video_id,video_url,original_youtube_url,source_post_id')
                    .in('id', candidateReelIds.slice(i, i + POSTGREST_IN_CHUNK))
                    .in('rights_status', NATIVE_PROCESSING_RIGHTS)
                    .eq('native_processing_requested', true);
                if (reelSelectErr) {
                    return res.status(500).json({
                        status: 'failed', stage: 'rights_revalidation', error: reelSelectErr.message,
                        scanned, requeued,
                    });
                }
                for (const reel of reels || []) reelsById.set(reel.id, reel);
            }

            const eligibleReelIds = new Set(reelsById.keys());
            const rightsClearedCandidates = candidates.filter(candidate => (
                eligibleReelIds.has(candidate.reel_id)
                && !isTerminalFailure(candidate.error_message)
                && isRecoveryCandidateAuthorized(candidate, reelsById.get(candidate.reel_id))
            ));

            // Requeue AND increment attempts (audit 2026-08-14). Until now
            // nothing anywhere incremented `attempts`, so the `.lt('attempts', 5)`
            // retry cap above could never bind — a permanently-broken job that
            // dodged the "permanent failure" patterns would requeue forever at
            // 1-hour spacing. supabase-js has no atomic increment on update, so
            // group ids by their CURRENT attempts value (already loaded in the
            // select) — at most 5 groups under the cap — one update per group.
            // Dedupe by canonical YouTube identity, not URL spelling. The
            // migration's partial unique index is the cross-transaction guard.
            const liveCanonicalKeys = new Set();
            {
                const candidateKeys = [...new Set(
                    rightsClearedCandidates
                        .map(c => c.canonical_asset_key || (extractYouTubeId(c.youtube_url)
                            ? `youtube:${extractYouTubeId(c.youtube_url)}`
                            : null))
                        .filter(Boolean)
                )];
                for (let i = 0; i < candidateKeys.length; i += 100) {
                    const { data: liveRows, error: liveRowsError } = await admin
                        .from('video_transcode_jobs')
                        .select('canonical_asset_key')
                        .in('status', ['queued', 'processing'])
                        .eq('source_type', 'youtube')
                        .in('canonical_asset_key', candidateKeys.slice(i, i + 100));
                    if (liveRowsError) {
                        return res.status(500).json({
                            status: 'failed', stage: 'live_job_revalidation', error: liveRowsError.message,
                            scanned, requeued,
                        });
                    }
                    for (const row of liveRows || []) liveCanonicalKeys.add(row.canonical_asset_key);
                }
            }
            const seenCanonicalKeys = new Set();
            const requeueable = rightsClearedCandidates.filter(c => {
                const youtubeId = extractYouTubeId(c.youtube_url);
                const canonicalKey = c.canonical_asset_key || (youtubeId ? `youtube:${youtubeId}` : null);
                if (!youtubeId || canonicalKey !== `youtube:${youtubeId}`) return false;
                if (liveCanonicalKeys.has(canonicalKey)) return false;
                if (seenCanonicalKeys.has(canonicalKey)) return false;
                seenCanonicalKeys.add(canonicalKey);
                return true;
            });

            const byAttempts = new Map();
            for (const c of requeueable) {
                const a = Number(c.attempts) || 0;
                if (!byAttempts.has(a)) byAttempts.set(a, []);
                byAttempts.get(a).push(c.id);
            }
            // CHUNKED (found live, 2026-08-14): the first run of the fixed
            // handler scanned 1,000 stuck jobs — a backlog of every transcode
            // that failed since the pipeline shipped, none ever recovered —
            // and the update died with 400 Bad Request: PostgREST's .in()
            // rides the QUERY STRING, and 1,000 text ids overflow it. 200 per
            // request stays comfortably under every URL limit involved.
            const CHUNK = 200;
            for (const [a, ids] of byAttempts) {
                for (let i = 0; i < ids.length; i += CHUNK) {
                    const slice = ids.slice(i, i + CHUNK);
                    const currentControl = await loadNativeControl(admin);
                    if (currentControl.state !== 'enabled') {
                        return res.status(currentControl.state === 'disabled' ? 200 : 503).json({
                            status: currentControl.state === 'disabled' ? 'disabled' : 'control_unavailable',
                            control: 'youtube_native_transcode',
                            scanned,
                            requeued,
                            sample_ids: sampleIds,
                        });
                    }
                    const { data: updatedRows, error: updateErr } = await requeueFailedJobs(admin, slice, a);
                    if (updateErr) {
                        if (String(updateErr.code || '') === '55000') {
                            return res.status(200).json({
                                status: 'disabled', control: 'youtube_native_transcode',
                                scanned, requeued, sample_ids: sampleIds,
                            });
                        }
                        return res.status(500).json({
                            status: 'failed', stage: 'update', error: updateErr.message,
                            scanned, requeued,
                        });
                    }
                    const updatedIds = (updatedRows || []).map(row => row.id);
                    requeued += updatedIds.length;
                    if (sampleIds.length < 5) sampleIds.push(...updatedIds.slice(0, 5 - sampleIds.length));
                }
            }
        }

        // Video-library staleness is observed directly from the database view.
        // Monitoring stays fail-open for recovery, but failures are visible.
        let libraryHealth = null;
        try {
            const { data: health, error: healthError } = await admin
                .from('video_library_health')
                .select('source_id,total_videos,last_scraped')
                .order('last_scraped', { ascending: true, nullsFirst: true });
            if (healthError) throw healthError;

            if (Array.isArray(health) && health.length) {
                const newest = health.reduce((max, r) => {
                    const t = r.last_scraped ? Date.parse(r.last_scraped) : 0;
                    return t > max ? t : max;
                }, 0);
                const staleHours = newest ? (Date.now() - newest) / 3_600_000 : Infinity;
                // 48h: the scrape is daily, so one missed run is noise and two
                // consecutive misses is a real outage.
                const STALE_HOURS = 48;
                const stale = staleHours > STALE_HOURS;
                const deadSources = health
                    .filter((r) => {
                        const t = r.last_scraped ? Date.parse(r.last_scraped) : 0;
                        return !t || (Date.now() - t) / 3_600_000 > STALE_HOURS * 7;
                    })
                    .map((r) => r.source_id);

                libraryHealth = {
                    stale,
                    hours_since_scrape: Math.round(staleHours),
                    sources: health.length,
                    total_videos: health.reduce((n, r) => n + Number(r.total_videos || 0), 0),
                    dead_sources: deadSources.slice(0, 10),
                };

                if (stale) {
                    console.error(
                        `[VIDEO_LIBRARY_STALE] No scrape in ${Math.round(staleHours)}h ` +
                            `(threshold ${STALE_HOURS}h). ${health.length} sources, ` +
                            `${libraryHealth.total_videos} videos. Ingestion is DOWN.`
                    );
                    try {
                        const { error: heartbeatError } = await admin.from('probe_heartbeats').insert({
                            probe_name: 'video-library-stale',
                            status: 'partial',
                            details: libraryHealth,
                        });
                        if (heartbeatError) throw heartbeatError;
                    } catch (heartbeatError) {
                        console.warn('[VIDEO_LIBRARY_STALE] heartbeat write failed:', heartbeatError?.message);
                    }
                }
            }
        } catch (healthError) {
            console.warn('[VIDEO_LIBRARY_HEALTH] monitoring query failed:', healthError?.message);
        }

        // Best-effort heartbeat — don't fail the response on heartbeat error.
        try {
            const { error: heartbeatError } = await admin.from('probe_heartbeats').insert({
                probe_name: 'yt-pipeline-recovery',
                status: 'ok',
                details: { requeued, scanned, permanentlyHidden: 0, duration_ms: Date.now() - started },
            });
            if (heartbeatError) throw heartbeatError;
        } catch (heartbeatError) {
            console.warn('[YT_PIPELINE_RECOVERY] heartbeat write failed:', heartbeatError?.message);
        }

        return res.status(200).json({
            status: 'ok',
            requeued,
            permanentlyHidden: 0,
            scanned,
            sample_ids: sampleIds,
            library_health: libraryHealth,
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
