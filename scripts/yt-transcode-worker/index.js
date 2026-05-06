/**
 * SMARTER POKER — YouTube → Native MP4 Worker (Operation TikTok Reels M1b)
 * scripts/yt-transcode-worker/index.js
 *
 * Standalone worker that runs alongside the existing HEVC transcode worker
 * (scripts/transcode-worker/index.js → sp-transcode.service) on the same
 * Hetzner box. Separate process, separate systemd unit (sp-yt-transcode.service),
 * separate concerns:
 *
 *   - HEVC worker (sp-transcode.service):   user iPhone uploads → H.264 MP4
 *     Polls social_posts.transcode_status='queued'.
 *
 *   - YouTube worker (sp-yt-transcode.service, THIS FILE):
 *     YouTube URLs in social_reels → native Supabase-hosted H.264 MP4.
 *     Polls video_transcode_jobs WHERE source_type='youtube' AND status='queued'.
 *     Requires yt-dlp + python3 (not installable on Vercel serverless,
 *     hence Hetzner-exclusive).
 *
 * Why separate processes?
 *   1. Blast-radius isolation. If yt-dlp segfaults on a malformed video, only
 *      the YouTube pipeline goes down. HEVC user uploads keep flowing.
 *   2. Independent deploys. Bumping yt-dlp doesn't require restarting the
 *      HEVC pipeline (and vice versa).
 *   3. Independent log streams (journalctl -u sp-yt-transcode).
 *   4. Independent concurrency tuning (HEVC is single-job, YT runs 3 in
 *      parallel because downloads are slow + bandwidth-bound).
 *
 * Pipeline:
 *   1. Atomically claim oldest queued YouTube job (UPDATE WHERE status='queued')
 *   2. yt-dlp downloads at <=1080p, MP4 container preferred
 *   3. ffmpeg re-encodes to libx264 main + AAC + faststart (web-safe, matches
 *      the cron transcoder's output for visual parity)
 *   4. Upload to social-media bucket at reels/{user_id}/{ts}_{job_id}.mp4
 *   5. social_reels.video_url ← public Supabase URL
 *      social_reels.source_type ← 'native'
 *      social_reels.media_status ← 'ready'
 *      video_transcode_jobs.status ← 'completed'
 *
 * On failure: reel stays as YouTube iframe (media_status='failed'),
 * job marked failed with error_message. Zero user-facing impact —
 * the YouTube iframe player keeps working as it always did.
 *
 * Required env (loaded from /etc/sp-yt-transcode.env on Hetzner):
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   NEXT_PUBLIC_SUPABASE_URL   — optional, defaults to production
 *   WORKER_ID                  — optional, defaults to hostname
 *   MAX_CONCURRENT_YT          — optional, defaults to 3
 *
 * Required system packages (apt + pip):
 *   ffmpeg    (apt install ffmpeg)
 *   python3   (apt install python3)
 *   yt-dlp    (pip3 install --upgrade yt-dlp  OR  apt install yt-dlp)
 *   Node.js >= 18
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat, access } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = join(__dirname, 'cookies.txt');

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('[yt-worker] FATAL: missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const POLL_MS = 60_000;                  // Idle poll interval
const FAST_POLL_MS = 5_000;              // When jobs are flowing, poll faster
const STORAGE_BUCKET = 'social-media';
const WORKER_ID = process.env.WORKER_ID || `hetzner-${hostname()}`;
const MAX_CONCURRENT_YT = Number(process.env.MAX_CONCURRENT_YT) || 3;
const YT_DOWNLOAD_TIMEOUT = 300_000;     // 5 min per yt-dlp call
const FFMPEG_TIMEOUT = 600_000;          // 10 min per re-encode
const MAX_FILE_SIZE = 500_000_000;       // 500 MB hard cap

let activeJobs = 0;
let shutdownRequested = false;

// ─── Logging ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(`[yt-worker ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[yt-worker ${new Date().toISOString()}]`, ...args);

// ════════════════════════════════════════════════════════════════════════════
// Permanent-failure patterns — yt-dlp exits non-zero and prints one of these.
// These videos will NEVER succeed regardless of retries. Promote reel to
// media_status='ready' so it renders as iframe-forever and clears the M4 gate.
// ════════════════════════════════════════════════════════════════════════════
const PERMANENT_PATTERNS = [
  /Video unavailable/i,
  /This video is private/i,
  /This video has been removed/i,
  /removed by the uploader/i,
  /This live event will begin/i,
  /age-restricted/i,
  /members-only/i,
  /copyright claim/i,
  /ffmpeg_timeout_/i,
  // M7.6: caught in deep audit — 8,177 reels were stuck because these
  // failures hit the worker but weren't classified permanent, so the
  // broadcast never fanned out 'iframe-forever' to siblings.
  /available to this channel's members/i,           // YouTube channel members-only (different msg from /members-only/)
  /Use --cookies-from-browser or --cookies/i,       // cookie auth required (datacenter IP blocked)
  /from-browser or --cookies for the authentication/i, // alternate phrasing
  /not available in your country/i,                 // region-blocked
  /use a VPN or a proxy server/i,                   // alternate region-block phrasing
  /yt-dlp_exit_null/i,                              // yt-dlp crashed without exit code — treat permanent, requeue manually if recoverable
  /Sign in to confirm/i,                            // YouTube anti-bot challenge
];
const isPermanentFailure = (msg) => PERMANENT_PATTERNS.some((rx) => rx.test(msg));

// ════════════════════════════════════════════════════════════════════════════
// Atomic claim — UPDATE only succeeds if status is still 'queued', so two
// workers can't race on the same job. Returns the claimed row, or null if
// another worker grabbed it (or queue is empty).
// ════════════════════════════════════════════════════════════════════════════
async function claimJob() {
  const { data: candidates, error } = await supa
    .from('video_transcode_jobs')
    .select('id, reel_id, user_id, youtube_url, source_url')
    .eq('status', 'queued')
    .eq('source_type', 'youtube')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) { warn('poll error:', error.message); return null; }
  if (!candidates || candidates.length === 0) return null;

  const candidate = candidates[0];

  const { data: claimed, error: claimErr } = await supa
    .from('video_transcode_jobs')
    .update({
      status: 'processing',
      worker_id: WORKER_ID,
      started_at: new Date().toISOString(),
    })
    .eq('id', candidate.id)
    .eq('status', 'queued')
    .select('id, reel_id, user_id, youtube_url, source_url')
    .maybeSingle();

  if (claimErr) { warn('claim error:', claimErr.message); return null; }
  return claimed;
}

// ════════════════════════════════════════════════════════════════════════════
// Process one job: download → re-encode → upload → DB update
// ════════════════════════════════════════════════════════════════════════════
async function processJob(job) {
  const ytUrl = job.youtube_url || job.source_url;
  const dir = await mkdtemp(join(tmpdir(), `yt-${job.id}-`));
  const rawFile = join(dir, 'raw.mp4');
  const outFile = join(dir, 'out.mp4');

  log(`▶ Job ${job.id} — ${ytUrl}`);

  try {
    // ── 1. Download via yt-dlp (<=1080p, MP4 preferred) ─────────────────────
    // Check for camoufox-harvested cookies (written by refresh-yt-cookies.py)
    const cookiesExist = await access(COOKIES_FILE).then(() => true).catch(() => false);
    if (cookiesExist) {
      log(`  Using cookies: ${COOKIES_FILE}`);
    } else {
      warn('  No cookies.txt found — downloads may fail on datacenter IPs');
    }

    // QUALITY: pick the BEST overall quality up to 1080p, regardless of codec.
    //
    // Earlier version preferred avc1 (H.264) so we could stream-copy.
    // Verified 2026-05-06: that produced ~1.5 Mbps output because YouTube
    // intentionally caps its H.264 renditions at low bitrates and reserves
    // the high-quality 1080p tier for VP9/AV1 only. Stream-copy of avc1
    // therefore preserves a low-source-quality file — exactly the regression
    // we were trying to avoid.
    //
    // New strategy: take the best video+audio under 1080p (commonly VP9
    // 1080p ~ 4-5 Mbps), and rely on the HQ re-encode path below
    // (preset=slow / crf=18 / profile=high / 192k AAC) to land at
    // 5-8 Mbps H.264 for native playback. Stream-copy is still tried
    // first in the rare case yt-dlp delivered avc1+aac+mp4.
    const ytdlpArgs = [
      '-f',
        'bv*[height<=1080]+ba/' +
        'b[height<=1080]/' +
        'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '--max-filesize', '400m',          // Abort download if file > 400 MB (before re-encode)
      '--match-filter', 'duration < 600', // Skip videos longer than 10 minutes
    ];
    if (cookiesExist) {
      ytdlpArgs.push('--cookies', COOKIES_FILE);
    }
    ytdlpArgs.push('-o', rawFile, ytUrl);

    await runProcess('yt-dlp', ytdlpArgs, YT_DOWNLOAD_TIMEOUT);

    // --match-filter exits with code 0 but creates no file when video is filtered
    const rawExists = await access(rawFile).then(() => true).catch(() => false);
    if (!rawExists) {
      warn(`  Job ${job.id} skipped — video filtered (too long or too large)`);
      await supa.from('video_transcode_jobs').update({
        status: 'skipped',
        completed_at: new Date().toISOString(),
        error_message: 'filtered: video exceeds duration or size limit',
      }).eq('id', job.id);
      return;
    }

    const rawStat = await stat(rawFile);
    if (rawStat.size > MAX_FILE_SIZE) {
      throw new Error(`raw_too_large_${rawStat.size}_bytes`);
    }
    log(`  Downloaded ${(rawStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 2. Always re-encode at HQ to H.264 ─────────────────────────────────
    //
    // History: prior versions tried stream-copy first to avoid double-encoding,
    // but the codec-agnostic format selector picks AV1 1080p (most efficient
    // codec). Stream-copying AV1 at YouTube's native ~0.5-0.75 Mbps gives
    // outputs that (a) are below browser playback compatibility for some
    // devices, (b) look low-res to viewers despite AV1's bitrate efficiency.
    //
    // Always re-encoding at preset=slow / crf=18 / profile=high / level=4.1
    // / 192k AAC produces ~5-8 Mbps H.264 1080p output — universally
    // browser-playable, visually high quality, and consistent regardless
    // of source codec (H.264 / VP9 / AV1).
    //
    // Cost: ~10-30s per video on Hetzner CPU. Worker concurrency 3 + 600s
    // ffmpeg timeout per job → comfortable headroom even for outliers.
    const SCALE_1080P =
      "scale='if(gt(iw,ih), min(1920,iw), -2)':'if(gt(iw,ih), -2, min(1920,ih))'";
    await runProcess('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', rawFile,
      '-vf', SCALE_1080P,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outFile,
    ], FFMPEG_TIMEOUT);

    const outStat = await stat(outFile);
    log(`  Re-encoded HQ → ${(outStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 3. Extract thumbnail (1s frame) ─────────────────────────────────────
    // Pull from rawFile (yt-dlp's pristine source) NOT outFile — avoids
    // inheriting any re-encode artifacts. Native resolution preserved
    // (caller can downscale via CSS); q:v 2 ≈ 95% jpeg quality.
    const thumbFile = join(dir, 'thumb.jpg');
    let thumbUrl = null;
    try {
      await runProcess('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '1',
        '-i', rawFile,
        '-vframes', '1',
        '-q:v', '2',
        thumbFile,
      ], 30_000);
      const thumbBuf = await readFile(thumbFile);
      const thumbPath = `reels/thumbs/${job.user_id}/${Date.now()}_${job.id}.jpg`;
      const { error: thumbErr } = await supa.storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbBuf, { contentType: 'image/jpeg', upsert: true });
      if (thumbErr) {
        warn(`  thumbnail upload warn:`, thumbErr.message);
      } else {
        const { data: thumbPub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(thumbPath);
        thumbUrl = thumbPub.publicUrl;
        log(`  Thumbnail → ${thumbUrl}`);
      }
    } catch (thumbEx) {
      warn(`  thumbnail extract skipped: ${thumbEx.message}`);
    }

    // ── 4. Upload video to social-media bucket ───────────────────────────────
    const storagePath = `reels/${job.user_id}/${Date.now()}_${job.id}.mp4`;
    const fileBuf = await readFile(outFile);
    const { error: upErr } = await supa.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuf, {
        contentType: 'video/mp4',
        upsert: true,
        cacheControl: '3600',
      });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = pub.publicUrl;

    // ── 5. Flip the reel: youtube → native ──────────────────────────────────
    if (job.reel_id) {
      const reelUpdate = {
        video_url: publicUrl,
        source_type: 'native',
        media_status: 'ready',
      };
      if (thumbUrl) reelUpdate.thumbnail_url = thumbUrl;
      const { error: reelErr } = await supa.from('social_reels').update(reelUpdate).eq('id', job.reel_id);
      if (reelErr) warn(`  reel update warn (job ${job.id}):`, reelErr.message);

      // M7: also rewrite the source social_posts.media_urls[0] so the main
      // social feed (and any other reader of social_posts) gets the native
      // URL. Without this, the same content shows twice in the Reels feed:
      // once as the converted reel, once as the still-iframe post.
      // Wrapped in a tolerant try/catch — failures here MUST NOT mark the
      // whole job failed (the reel side already succeeded).
      try {
        const { data: reelRow } = await supa.from('social_reels')
          .select('source_post_id, thumbnail_url')
          .eq('id', job.reel_id).maybeSingle();
        if (reelRow?.source_post_id) {
          const { data: postRow } = await supa.from('social_posts')
            .select('media_urls, thumbnail_url, original_media_url')
            .eq('id', reelRow.source_post_id).maybeSingle();
          if (postRow) {
            const existingArr = Array.isArray(postRow.media_urls) ? postRow.media_urls : [];
            const updatePayload = {
              media_urls: [publicUrl, ...existingArr.slice(1)],
              original_media_url: postRow.original_media_url || existingArr[0] || null,
            };
            if (!postRow.thumbnail_url && reelRow.thumbnail_url) {
              updatePayload.thumbnail_url = reelRow.thumbnail_url;
            }
            const { error: postErr } = await supa.from('social_posts')
              .update(updatePayload).eq('id', reelRow.source_post_id);
            if (postErr) warn(`  post sync warn (job ${job.id}):`, postErr.message);
            else log(`  ↳ synced social_posts.media_urls[0] for post ${reelRow.source_post_id}`);
          }
        }
      } catch (syncErr) {
        warn(`  syncPostFromReel skipped (job ${job.id}):`, syncErr?.message);
      }

      // M7.1: BROADCAST — multiple horses can post the same YouTube clip,
      // landing as N social_reels rows with the same video_url. The trigger
      // (m7_1) cancels redundant jobs so we convert each unique URL once.
      // Now we fan the conversion result out to ALL sibling reels (same
      // original_youtube_url, different reel id) and their source_posts.
      const sourceYtUrl = job.youtube_url || job.source_url;
      if (sourceYtUrl) {
        try {
          // Update sibling reels — use original_youtube_url which the trigger
          // populated and which never gets rewritten by the worker (only
          // video_url flips). Excludes the reel we just updated above.
          const { data: siblings, error: sibErr } = await supa
            .from('social_reels')
            .update({
              video_url: publicUrl,
              source_type: 'native',
              media_status: 'ready',
              ...(thumbUrl ? { thumbnail_url: thumbUrl } : {}),
            })
            .eq('original_youtube_url', sourceYtUrl)
            .neq('id', job.reel_id)
            .select('id, source_post_id');
          if (sibErr) {
            warn(`  sibling broadcast warn (job ${job.id}):`, sibErr.message);
          } else if (siblings?.length) {
            log(`  ↳ broadcast native URL to ${siblings.length} sibling reel(s)`);

            // Sync each sibling's source_post in one batch — pull all rows,
            // rewrite media_urls[0], write back. ~10ms per sibling.
            const sourcePostIds = siblings.map(s => s.source_post_id).filter(Boolean);
            if (sourcePostIds.length) {
              const { data: siblingPosts } = await supa.from('social_posts')
                .select('id, media_urls, thumbnail_url, original_media_url')
                .in('id', sourcePostIds);
              for (const sp of (siblingPosts || [])) {
                const arr = Array.isArray(sp.media_urls) ? sp.media_urls : [];
                const payload = {
                  media_urls: [publicUrl, ...arr.slice(1)],
                  original_media_url: sp.original_media_url || arr[0] || null,
                };
                if (!sp.thumbnail_url && thumbUrl) payload.thumbnail_url = thumbUrl;
                await supa.from('social_posts').update(payload).eq('id', sp.id);
              }
              log(`  ↳ broadcast native URL to ${siblingPosts?.length || 0} sibling post(s)`);
            }
          }
        } catch (broadcastErr) {
          warn(`  sibling broadcast skipped (job ${job.id}):`, broadcastErr?.message);
        }
      }
    } else {
      warn(`  Job ${job.id} has no reel_id — video uploaded but no reel linked`);
    }

    // ── 6. Mark job done ────────────────────────────────────────────────────
    await supa.from('video_transcode_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_url: publicUrl,
      error_message: null,
    }).eq('id', job.id);

    log(`✓ Job ${job.id} → ${publicUrl}`);

  } catch (err) {
    const msg = (err?.message || String(err)).slice(0, 500);
    warn(`✗ Job ${job.id} failed: ${msg}`);

    const permanent = isPermanentFailure(msg);

    if (job.reel_id) {
      try {
        await supa.from('social_reels')
          .update({ media_status: permanent ? 'ready' : 'failed' })
          .eq('id', job.reel_id);
      } catch (_) {}

      // M7.1: BROADCAST FAILURE — when a video is permanently unconvertible
      // (private/removed/age-restricted/...), every sibling reel sharing the
      // same source URL is also unconvertible. Set them all to iframe-forever
      // so they don't stay stuck in 'queued' state with no job to claim them.
      if (permanent) {
        const sourceYtUrl = job.youtube_url || job.source_url;
        if (sourceYtUrl) {
          try {
            const { data: siblings } = await supa.from('social_reels')
              .update({ media_status: 'ready' })
              .eq('original_youtube_url', sourceYtUrl)
              .neq('id', job.reel_id)
              .in('media_status', ['queued', 'processing', 'failed'])
              .select('id');
            if (siblings?.length) {
              log(`  ↳ broadcast iframe-forever to ${siblings.length} sibling reel(s) (permanent failure)`);
            }
          } catch (_) {}
        }
      }
    }
    try {
      await supa.from('video_transcode_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      }).eq('id', job.id);
    } catch (_) {}

    if (permanent) log(`  (permanent — reel ${job.reel_id} kept as iframe-forever)`);

  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Tick: claim up to MAX_CONCURRENT_YT jobs and dispatch in parallel.
// Fire-and-forget — does NOT await jobs to finish, lets them run concurrently.
// ════════════════════════════════════════════════════════════════════════════
async function tick() {
  if (shutdownRequested) return 0;  // No new jobs after SIGTERM
  let dispatched = 0;
  while (activeJobs < MAX_CONCURRENT_YT) {
    const job = await claimJob();
    if (!job) break;
    activeJobs++;
    dispatched++;
    processJob(job)
      .catch((e) => warn('uncaught processJob:', e?.message))
      .finally(() => { activeJobs--; });
  }
  return dispatched;
}

// ════════════════════════════════════════════════════════════════════════════
// Generic process runner — captures stderr tail in the rejected error so
// failures are diagnosable from journalctl without repro.
// ════════════════════════════════════════════════════════════════════════════
function runProcess(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderrTail = '';
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      stderrTail = (stderrTail + s).slice(-1000);
    });
    proc.on('error', (err) => reject(new Error(`${cmd}_spawn_${err.code || err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd}_exit_${code}: ${stderrTail.slice(-300)}`));
    });
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${cmd}_timeout_${timeoutMs / 1000}s`));
    }, timeoutMs);
    proc.on('close', () => clearTimeout(timer));
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Stale-processing reset — clears ANY 'processing' YouTube job that has been
// stuck for >10 minutes, regardless of which worker claimed it. Called at
// startup (worker_startup) AND on every poll tick (periodic_stale_reset) so
// orphans from crashed workers / previous deploys are never permanent zombies.
// ════════════════════════════════════════════════════════════════════════════
async function resetStaleProcessing(reason = 'periodic_stale_reset') {
  const { data, error } = await supa.from('video_transcode_jobs')
    .update({
      status: 'queued',
      worker_id: null,
      started_at: null,
      error_message: reason,
    })
    .eq('status', 'processing')
    .eq('source_type', 'youtube')
    .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select('reel_id');

  if (error) { warn('stale reset error:', error.message); return; }
  if (!data?.length) return;

  log(`Reset ${data.length} stale 'processing' row(s) (${reason})`);

  const reelIds = data.map((r) => r.reel_id).filter(Boolean);
  if (reelIds.length) {
    await supa.from('social_reels')
      .update({ media_status: 'queued' })
      .in('id', reelIds);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Cookie-recovery self-healer — runs once every COOKIE_RECOVERY_INTERVAL.
//
// Problem: cookie/auth failures are classified PERMANENT (M7.6) so the worker
// broadcasts iframe-forever to siblings to clear the queue. But cookies are
// recoverable — when a fresh authenticated cookies.txt arrives on the box
// (via deploy-yt-cookies.yml or the local launchd refresh), the previously-
// flagged-permanent reels can convert successfully. They just need someone
// to put them back in the queue.
//
// This function does that automatically:
//   1. Confirm cookies are healthy NOW: a successful conversion has happened
//      MORE RECENTLY than the latest cookie-auth failure.
//   2. Find reels that were broadcast iframe-forever during the broken
//      window AND have an `original_youtube_url` (i.e., came through the
//      YouTube pipeline, are convertible).
//   3. Reset them: video_url ← original_youtube_url, source_type='youtube',
//      media_status='queued', thumbnail_url=NULL.
//   4. INSERT new transcode jobs for distinct URLs (deduped against any
//      live job).
//
// Throttled to once per COOKIE_RECOVERY_INTERVAL_MS (15 min) so it doesn't
// hammer DB. Idempotent — re-running is safe.
// ════════════════════════════════════════════════════════════════════════════
const COOKIE_RECOVERY_INTERVAL_MS = 15 * 60 * 1000;
let lastCookieRecoveryAt = 0;

async function cookieRecoverySweep() {
  if (Date.now() - lastCookieRecoveryAt < COOKIE_RECOVERY_INTERVAL_MS) return;
  lastCookieRecoveryAt = Date.now();

  // 1. Confirm cookies are healthy: latest success > latest cookie failure
  const { data: lastSuccess } = await supa.from('video_transcode_jobs')
    .select('completed_at')
    .eq('status', 'completed').eq('source_type', 'youtube')
    .order('completed_at', { ascending: false }).limit(1).maybeSingle();
  if (!lastSuccess?.completed_at) return; // No conversions yet, nothing to compare

  const { data: lastCookieFail } = await supa.from('video_transcode_jobs')
    .select('completed_at')
    .eq('status', 'failed').eq('source_type', 'youtube')
    .or('error_message.ilike.%cookies-from-browser%,error_message.ilike.%cookies for the authentication%,error_message.ilike.%Sign in to confirm%')
    .order('completed_at', { ascending: false }).limit(1).maybeSingle();

  // No cookie failures ever, or last failure pre-dates last success → cookies healthy
  if (lastCookieFail?.completed_at && new Date(lastCookieFail.completed_at) >= new Date(lastSuccess.completed_at)) {
    // Cookies are still broken (most-recent failure is newer than most-recent success)
    return;
  }

  // 2. Find candidate reels: in 'ready' state, video_url is YouTube, has
  // original_youtube_url. NOT a member-only / private / region-locked
  // permanent — to detect those we'd need failure history per URL, but a
  // benign retry is cheap (worst case it fails permanent again).
  const { data: candidates } = await supa.from('social_reels')
    .select('id, author_id, original_youtube_url')
    .eq('media_status', 'ready')
    .ilike('video_url', '%youtube%')
    .not('original_youtube_url', 'is', null)
    .limit(500);
  if (!candidates?.length) return;

  // 3. Reset eligible reels back to 'queued'. Only the ones whose latest
  // failure was a cookie-auth failure — others (members-only / private /
  // region) should stay iframe-forever.
  const recoverable = [];
  for (const r of candidates) {
    const { data: job } = await supa.from('video_transcode_jobs')
      .select('error_message,status')
      .or(`youtube_url.eq.${r.original_youtube_url},source_url.eq.${r.original_youtube_url}`)
      .order('completed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (!job) continue;
    const wasCookieFail = job.status === 'failed' && /cookies-from-browser|cookies for the authentication|Sign in to confirm/i.test(job.error_message || '');
    if (wasCookieFail) recoverable.push(r);
  }

  if (!recoverable.length) return;
  log(`cookie-recovery: ${recoverable.length} reel(s) eligible — re-queueing`);

  // Reset reel state
  await supa.from('social_reels').update({
    media_status: 'queued',
    source_type: 'youtube',
  }).in('id', recoverable.map((r) => r.id));

  // We need to also revert video_url. supabase-js doesn't allow per-row
  // updates in a single .update() call, so set video_url=original_youtube_url
  // for each reel via a small batched loop.
  for (const r of recoverable) {
    await supa.from('social_reels').update({
      video_url: r.original_youtube_url,
      thumbnail_url: null,
    }).eq('id', r.id);
  }

  // INSERT one job per distinct URL (the trigger only fires on INSERT not UPDATE)
  const seen = new Set();
  let inserted = 0;
  for (const r of recoverable) {
    if (seen.has(r.original_youtube_url)) continue;
    seen.add(r.original_youtube_url);

    // Skip if a live job already exists for this URL (race safety — the
    // partial unique index also enforces this at row-level)
    const { data: existing } = await supa.from('video_transcode_jobs')
      .select('id').eq('source_type', 'youtube')
      .or(`youtube_url.eq.${r.original_youtube_url},source_url.eq.${r.original_youtube_url}`)
      .in('status', ['queued', 'processing']).limit(1).maybeSingle();
    if (existing) continue;

    const { error: insErr } = await supa.from('video_transcode_jobs').insert({
      reel_id: r.id, user_id: r.author_id,
      source_url: r.original_youtube_url,
      youtube_url: r.original_youtube_url,
      source_type: 'youtube', status: 'queued',
      target_format: 'h264_1080p', target_bitrate: 2500000,
    });
    if (!insErr) inserted++;
  }
  log(`cookie-recovery: enqueued ${inserted} new job(s) across ${seen.size} distinct URL(s)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Main loop — adaptive polling. Fast (5s) when jobs are flowing, slow (60s)
// when the queue is idle. Saves wasted DB roundtrips during quiet hours.
// ════════════════════════════════════════════════════════════════════════════
log(`Starting yt-transcode-worker`);
log(`  Worker ID:        ${WORKER_ID}`);
log(`  Supabase:         ${SUPABASE_URL}`);
log(`  Concurrency:      ${MAX_CONCURRENT_YT}`);
log(`  Poll: idle ${POLL_MS / 1000}s / busy ${FAST_POLL_MS / 1000}s`);

await resetStaleProcessing('worker_startup');

async function pollLoop() {
  try {
    await resetStaleProcessing();   // periodic: every tick, catches cross-worker orphans
    // Cookie-recovery sweep — throttled internally to once / 15 min. Only
    // mutates state when latest successful conversion is more recent than
    // latest cookie-auth failure (i.e., cookies have been refreshed).
    cookieRecoverySweep().catch((e) => warn('cookie-recovery error:', e?.message));
    const dispatched = await tick();
    // If we just dispatched work or are still busy, poll fast; else slow.
    const nextDelay = (dispatched > 0 || activeJobs > 0) ? FAST_POLL_MS : POLL_MS;
    setTimeout(pollLoop, nextDelay);
  } catch (e) {
    warn('tick error:', e?.message);
    setTimeout(pollLoop, POLL_MS);
  }
}
pollLoop();

// ─── Graceful shutdown ───────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log(`${signal} received — draining ${activeJobs} active job(s) before exit...`);
  const waitForDrain = () => {
    if (activeJobs === 0) {
      log('All jobs drained. Exiting cleanly.');
      process.exit(0);
    } else {
      log(`  Waiting for ${activeJobs} job(s) to finish...`);
      setTimeout(waitForDrain, 2_000);
    }
  };
  waitForDrain();
  // Hard kill after 10 min if jobs are stuck
  setTimeout(() => {
    warn('Drain timeout (10 min) — forcing exit.');
    process.exit(1);
  }, 600_000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
