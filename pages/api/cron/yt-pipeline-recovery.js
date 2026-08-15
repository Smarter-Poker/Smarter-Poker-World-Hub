/**
 * /api/cron/yt-pipeline-recovery — Open Claw auto-recovery for YouTube pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * Fired by openclaw-cron-dispatcher every 6 hours.
 *
 * Re-queues video_transcode_jobs that failed with cookie-auth or transient
 * patterns so the worker retries them with the current stack:
 *   - bgutil-pot-provider POT tokens (no Google login)
 *   - player_client=default (2026-08-15: the old
 *     tv,web_safari,mweb,web_embedded pin made YouTube return ONE format,
 *     itag 18 / 640x360, so every ingest was 360p — see
 *     .agent/audits/2026-08-15-360p-RESOLVED-verified-1080p.md)
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
            .select('id, reel_id, attempts, error_message, updated_at, youtube_url, source_type')
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
            // DEDUPE (found live, 2026-08-14, third latent bug in this job):
            // uniq_video_transcode_jobs_yt_url_live enforces ONE live
            // (queued/processing) job per youtube_url. The never-recovered
            // backlog contains repeated failures of the same URL, so a bulk
            // requeue violates it — the first fixed run requeued 200 and then
            // died on a duplicate. Requeue at most one candidate per URL and
            // skip URLs that already have a live twin.
            const liveUrls = new Set();
            {
                const candUrls = [...new Set(
                    candidates
                        .filter(c => c.source_type === 'youtube' && c.youtube_url)
                        .map(c => c.youtube_url)
                )];
                for (let i = 0; i < candUrls.length; i += 100) {
                    const { data: liveRows } = await admin
                        .from('video_transcode_jobs')
                        .select('youtube_url')
                        .in('status', ['queued', 'processing'])
                        .eq('source_type', 'youtube')
                        .in('youtube_url', candUrls.slice(i, i + 100));
                    for (const r of liveRows || []) liveUrls.add(r.youtube_url);
                }
            }
            const seenUrls = new Set();
            const requeueable = candidates.filter(c => {
                if (c.source_type !== 'youtube' || !c.youtube_url) return true;
                if (liveUrls.has(c.youtube_url)) return false;   // live twin exists
                if (seenUrls.has(c.youtube_url)) return false;    // batch duplicate
                seenUrls.add(c.youtube_url);
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
                    const { error: updateErr } = await admin
                        .from('video_transcode_jobs')
                        .update({
                            status: 'queued',
                            error_message: null,
                            worker_id: null,
                            locked_at: null,
                            attempts: a + 1,
                        })
                        .in('id', slice);
                    if (updateErr) {
                        return res.status(500).json({
                            status: 'failed', stage: 'update', error: updateErr.message,
                            scanned, requeued,
                        });
                    }
                    requeued += slice.length;
                    if (sampleIds.length < 5) sampleIds.push(...slice.slice(0, 5 - sampleIds.length));
                }
            }
        }

        // ── Video-library staleness watch (2026-08-15) ────────────────────
        // The library silently stopped ingesting on 2026-04-22 and nobody
        // noticed for 116 days. The reason it went unseen: the scraper reports
        // its health by POSTing to /api/cron/video-library-scraper?report=1,
        // a route that does not exist, and the 404 is swallowed by a bare
        // except. Meanwhile public.video_library_health — a per-source health
        // VIEW with exactly the right columns — had been sitting there since
        // April with NO consumer at all.
        //
        // This is the consumer. It does not fix ingestion; it makes a stalled
        // pipeline impossible to miss. Fail-open: a monitoring query must
        // never take down the recovery cron it is riding on.
        let libraryHealth = null;
        try {
            const { data: health } = await admin
                .from('video_library_health')
                .select('source_id,total_videos,last_scraped')
                .order('last_scraped', { ascending: true, nullsFirst: true });

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
                        await admin.from('probe_heartbeats').insert({
                            probe_name: 'video-library-stale',
                            // status is NOT NULL with no default — omitting it
                            // makes the insert fail and the catch swallow it,
                            // which is exactly how this table ended up empty.
                            status: 'stale',
                            details: libraryHealth,
                        });
                    } catch (_) { /* non-fatal */ }
                }
            }
        } catch (_) { /* monitoring must never break the cron */ }

        // Best-effort heartbeat — don't fail the response on heartbeat error.
        try {
            await admin.from('probe_heartbeats').insert({
                probe_name: 'yt-pipeline-recovery',
                // 2026-08-15: this insert has ALWAYS failed. probe_heartbeats.status
                // is NOT NULL with no default, so every call raised 23502 and the
                // bare catch below hid it — this cron has run successfully for
                // months while writing zero heartbeats. Every other cron in
                // pages/api/cron/ passes status; this file was the only one that
                // did not.
                status: 'success',
                details: { requeued, scanned, permanentlyHidden, duration_ms: Date.now() - started },
            });
        } catch (_) { /* heartbeats table may not exist on all envs */ }

        return res.status(200).json({
            status: 'ok',
            requeued,
            permanentlyHidden,
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
