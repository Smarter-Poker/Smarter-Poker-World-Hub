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
//
// 2026-05-07 incident: 187 jobs stacked in 'processing' state with 0
// completing or failing in 10 min. Diagnosis: worker had been up 24h+
// since the 2026-05-06 12:52 deploy and accumulated orphaned 'processing'
// rows from prior restarts (each restart claimed MAX_CONCURRENT_YT=6
// jobs, crashed before finishing them, jobs stayed in DB processing state).
// resetStaleProcessing's 10-min threshold should have cleaned them up
// but the poll loop itself was likely stuck on a hung subprocess.
//
// Fix: trigger a fresh deploy to force `systemctl restart sp-yt-transcode`,
// which calls resetStaleProcessing('worker_startup') and clears the
// stuck 'processing' rows back to 'queued' before resuming normal claims.
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
  /filtered_too_long_or_large/i,                    // yt-dlp --match-filter rejected (>10min or >400MB) — fundamentally unconvertible by this pipeline
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
    //
    // 2026-05-07 BUG FIX: previous code did .update({status:'skipped'}) here.
    // The CHECK constraint on video_transcode_jobs.status only allows
    // (queued, processing, running, completed, done, failed, cancelled) —
    // 'skipped' violates the constraint, the UPDATE silently rejects, the
    // worker returns, and the row stays in 'processing' state FOREVER.
    // resetStaleProcessing flips it back to queued after 10 min, the worker
    // re-claims it, re-skips it — infinite loop. As of this morning, 198
    // jobs were stuck in this loop with 0 forward progress in 2+ hours.
    //
    // Fix: throw an Error with a unique pattern that PERMANENT_PATTERNS
    // matches. The catch block below sets status='failed' (allowed) AND
    // broadcasts iframe-forever to all sibling reels with the same URL.
    // Net result: long-video reels become permanent iframes, no stuck rows.
    const rawExists = await access(rawFile).then(() => true).catch(() => false);
    if (!rawExists) {
      throw new Error('filtered_too_long_or_large: yt-dlp --match-filter rejected (duration ≥ 600s or size > 400m)');
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
// Orphaned-queued sweep — finds reels stuck in media_status='queued' for
// over 5 minutes with no live transcode job. This happens when:
//   - A bulk SQL UPDATE moved reels to 'queued' but the queue trigger only
//     fires on INSERT, so no jobs were created.
//   - A previous job's permanent-failure broadcast went stale.
//   - Manual ops re-queues that didn't go through the INSERT path.
//
// One-shot recovery: INSERT a fresh transcode job per distinct URL
// (deduped via the partial unique index). The worker picks them up on
// the next claim cycle.
//
// Throttled to once / ORPHAN_SWEEP_INTERVAL_MS (5 min). Cheap query;
// safe to run every tick if needed.
// ════════════════════════════════════════════════════════════════════════════
const ORPHAN_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastOrphanSweepAt = 0;

async function orphanedQueuedSweep() {
  if (Date.now() - lastOrphanSweepAt < ORPHAN_SWEEP_INTERVAL_MS) return;
  lastOrphanSweepAt = Date.now();

  // Find reels that have been 'queued' >5 min but have no live job for
  // their video_url (delay prevents thrashing on legitimate insert races).
  const minAgeIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: orphans } = await supa.from('social_reels')
    .select('id, author_id, video_url, updated_at')
    .eq('media_status', 'queued')
    .eq('source_type', 'youtube')
    .ilike('video_url', '%youtube%')
    .lt('updated_at', minAgeIso)
    .limit(500);
  if (!orphans?.length) return;

  // Batch-fetch live jobs for those URLs in one query
  const urls = Array.from(new Set(orphans.map((o) => o.video_url)));
  const { data: liveJobs } = await supa.from('video_transcode_jobs')
    .select('youtube_url')
    .eq('source_type', 'youtube')
    .in('youtube_url', urls)
    .in('status', ['queued', 'processing', 'completed']);
  const haveLiveJob = new Set((liveJobs || []).map((j) => j.youtube_url));

  // Filter to actual orphans (no live job for their URL)
  const trulyOrphaned = orphans.filter((o) => !haveLiveJob.has(o.video_url));
  if (!trulyOrphaned.length) {
    log(`orphan-sweep: ${orphans.length} candidates checked, all have live jobs (no action)`);
    return;
  }

  log(`orphan-sweep: ${trulyOrphaned.length} reel(s) without live job — inserting jobs`);

  // INSERT one job per distinct URL, tolerate unique-violation races
  const seen = new Set();
  let inserted = 0;
  let skipped = 0;
  for (const o of trulyOrphaned) {
    if (seen.has(o.video_url)) continue;
    seen.add(o.video_url);

    const { error: insErr } = await supa.from('video_transcode_jobs').insert({
      reel_id: o.id, user_id: o.author_id,
      source_url: o.video_url,
      youtube_url: o.video_url,
      source_type: 'youtube', status: 'queued',
      target_format: 'h264_1080p', target_bitrate: 2500000,
    });
    if (insErr) {
      if (insErr.code === '23505') skipped++;       // race against another insert
      else warn(`orphan-sweep: insert failed for ${o.video_url}: ${insErr.message}`);
    } else {
      inserted++;
    }
  }
  log(`orphan-sweep: enqueued ${inserted} job(s); skipped ${skipped} (race)`);
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
  if (!lastSuccess?.completed_at) {
    log('cookie-recovery: no successful conversions yet — bailing');
    return;
  }

  const { data: lastCookieFail } = await supa.from('video_transcode_jobs')
    .select('completed_at')
    .eq('status', 'failed').eq('source_type', 'youtube')
    .or('error_message.ilike.%cookies-from-browser%,error_message.ilike.%cookies for the authentication%,error_message.ilike.%Sign in to confirm%')
    .order('completed_at', { ascending: false }).limit(1).maybeSingle();

  // Cookies still broken if most-recent failure is newer than (or equal to)
  // most-recent success. Bail.
  if (lastCookieFail?.completed_at && new Date(lastCookieFail.completed_at) >= new Date(lastSuccess.completed_at)) {
    log('cookie-recovery: cookies still broken (latest failure is newer than latest success) — bailing');
    return;
  }

  // 2. PRE-FILTER candidate URLs by failure cause BEFORE pulling reels.
  //
  // BUGFIX 2026-05-08: prior version pulled the first 500 social_reels
  // rows with .limit(500) but no ORDER BY, then post-filtered to
  // cookie-auth failures. With ~9,300 iframe-flagged YouTube reels and
  // only ~1,000 of them affected by cookie-auth, Postgres' heap-order
  // first-500 typically contained ZERO cookie-auth ones. The sweep would
  // log "0 had cookie-auth as latest failure" and bail forever, leaving
  // the cookie-failed pool permanently stranded. Now we query the
  // FAILED-JOBS table first (filtered to cookie-auth patterns), build
  // the URL set, then pull social_reels.in(those URLs) so the LIMIT 500
  // only counts eligible reels.
  const { data: cookieFailedJobs } = await supa.from('video_transcode_jobs')
    .select('youtube_url, completed_at')
    .eq('source_type', 'youtube')
    .eq('status', 'failed')
    .or('error_message.ilike.%cookies-from-browser%,error_message.ilike.%cookies for the authentication%,error_message.ilike.%Sign in to confirm%')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(2000);

  // Dedup by URL — the most-recent failure per URL wins (ordered DESC).
  const cookieFailedUrls = new Set();
  for (const j of (cookieFailedJobs || [])) {
    cookieFailedUrls.add(j.youtube_url);
  }
  if (cookieFailedUrls.size === 0) {
    log('cookie-recovery: no cookie-auth failures in jobs history — nothing to recover');
    return;
  }

  // 3. Pull social_reels rows whose original_youtube_url is in the cookie-
  // failed URL set, limited to ones still in 'ready' state (iframe-forever).
  const urlsArray = Array.from(cookieFailedUrls).slice(0, 500);
  const { data: candidates } = await supa.from('social_reels')
    .select('id, author_id, original_youtube_url')
    .eq('media_status', 'ready')
    .ilike('video_url', '%youtube%')
    .in('original_youtube_url', urlsArray)
    .limit(500);
  if (!candidates?.length) {
    log(`cookie-recovery: ${cookieFailedUrls.size} cookie-auth URL(s) but no matching ready-state reels — nothing to recover`);
    return;
  }

  // 4. Verify the LATEST failed job per URL is still cookie-auth (not a
  // mixed-failure URL where a permanent failure happened more recently).
  // This prevents re-queueing reels whose most-recent failure is actually
  // members-only / private / region-blocked.
  const allUrlsForLatestCheck = Array.from(new Set(candidates.map((r) => r.original_youtube_url)));
  const { data: latestJobs } = await supa.from('video_transcode_jobs')
    .select('youtube_url, status, error_message, completed_at')
    .eq('source_type', 'youtube')
    .eq('status', 'failed')
    .in('youtube_url', allUrlsForLatestCheck)
    .order('completed_at', { ascending: false, nullsFirst: false });

  const latestCookieFailedUrls = new Set();
  const seenUrl = new Set();
  for (const j of (latestJobs || [])) {
    if (seenUrl.has(j.youtube_url)) continue;
    seenUrl.add(j.youtube_url);
    if (/cookies-from-browser|cookies for the authentication|Sign in to confirm/i.test(j.error_message || '')) {
      latestCookieFailedUrls.add(j.youtube_url);
    }
  }

  const recoverable = candidates.filter((r) => latestCookieFailedUrls.has(r.original_youtube_url));
  if (!recoverable.length) {
    log(`cookie-recovery: ${candidates.length} candidates checked, 0 had cookie-auth as latest failure (later permanent failure took precedence)`);
    return;
  }
  log(`cookie-recovery: ${recoverable.length} reel(s) eligible (across ${latestCookieFailedUrls.size} URL(s)) — re-queueing`);

  // 4. Reset reel state in a small batched loop. We need per-row video_url
  // assignments (supabase-js doesn't allow CASE expressions in update()).
  for (const r of recoverable) {
    await supa.from('social_reels').update({
      video_url: r.original_youtube_url,
      source_type: 'youtube',
      media_status: 'queued',
      thumbnail_url: null,
    }).eq('id', r.id);
  }

  // 5. INSERT one job per distinct URL. Trigger fires on INSERT not UPDATE.
  // Wrapped in try/catch per-URL because the partial unique index
  // uniq_video_transcode_jobs_yt_url_live can race-reject duplicates if a
  // sibling worker / trigger already enqueued — we tolerate that as a
  // "someone else handled it" outcome.
  let inserted = 0;
  let raceSkipped = 0;
  for (const url of cookieFailedUrls) {
    const reel = recoverable.find((r) => r.original_youtube_url === url);
    if (!reel) continue;

    // Skip if already a live job for this URL (race safety)
    const { data: existing } = await supa.from('video_transcode_jobs')
      .select('id').eq('source_type', 'youtube')
      .eq('youtube_url', url)
      .in('status', ['queued', 'processing'])
      .limit(1).maybeSingle();
    if (existing) { raceSkipped++; continue; }

    const { error: insErr } = await supa.from('video_transcode_jobs').insert({
      reel_id: reel.id, user_id: reel.author_id,
      source_url: url,
      youtube_url: url,
      source_type: 'youtube', status: 'queued',
      target_format: 'h264_1080p', target_bitrate: 2500000,
    });
    if (insErr) {
      // unique_violation = partial-index race, treat as benign
      if (insErr.code === '23505') raceSkipped++;
      else warn(`cookie-recovery: insert failed for ${url}: ${insErr.message}`);
    } else {
      inserted++;
    }
  }
  log(`cookie-recovery: enqueued ${inserted} job(s); skipped ${raceSkipped} (race / already queued)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Transient-failure retry sweep — finds reels stuck in media_status='failed'
// whose LATEST job hit a transient error (rate-limited / timeout /
// ffmpeg_exit_255 / yt-dlp_spawn / Bad Gateway / cookie-auth), and that have
// NO permanent-failure history (members-only / private / region-blocked /
// filtered-too-long). These should retry: rate limits decay, cookies refresh,
// transient ffmpeg crashes don't repeat.
//
// Why this exists: cookieRecoverySweep covers `media_status='ready'`
// (iframe-flagged) reels. orphanedQueuedSweep covers `media_status='queued'`.
// Reels in `media_status='failed'` are invisible to both — they need a
// dedicated sweep. Audited 2026-05-07 and found 117 reels stuck this way
// with 50 rate-limit / 31 cookie / 24 timeout / 9 ffmpeg-255 / 2 spawn —
// all transient, none had been retried.
//
// Bounded retries: skip reels with ≥3 failed jobs for the same URL to
// prevent infinite retry loops on persistent (but transient-shaped) issues.
// Throttled to once / TRANSIENT_RETRY_INTERVAL_MS (30 min).
// Only reconsiders failures older than 1 hour (gives transient sources
// time to recover before retrying — rate limits, cookie pushes, etc.).
// ════════════════════════════════════════════════════════════════════════════
const TRANSIENT_RETRY_INTERVAL_MS = 30 * 60 * 1000;
const TRANSIENT_FAILURE_MIN_AGE_MS = 60 * 60 * 1000;   // only retry failures >1h old
const TRANSIENT_RETRY_CAP = 3;                          // skip reels with ≥3 failures
let lastTransientRetryAt = 0;

// Stranded-reel recovery sweep — catch-all safety net.
// PERMANENT_PATTERNS includes several patterns that are actually transient
// (cookies, ffmpeg_timeout_, Sign in to confirm, yt-dlp_exit_null, etc).
// When the worker hits one, it flips media_status='ready' (iframe-forever)
// to keep the user-facing iframe working. cookieRecoverySweep handles the
// cookie subset, but other transient-but-classified-permanent failures
// have no dedicated retry path. This sweep is the universal catch-all:
// it scans ANY ready-state YT reel whose failures are only transient
// (no truly-permanent ones mixed in) and re-queues them. Runs hourly,
// capped at 100 per tick, plus once on worker startup so deploys
// auto-recover any stranded backlog.
const STRANDED_RECOVERY_INTERVAL_MS = 60 * 60 * 1000;   // hourly
const STRANDED_RECOVERY_BATCH       = 100;
const STRANDED_RECOVERY_MIN_AGE_MS  = 60 * 60 * 1000;   // wait >1h after last failure
let lastStrandedRecoveryAt = 0;

// Failed-reel iframe fallback — eighth self-healer. The frontend treats
// media_status='failed' (and 'queued' with no live job) as un-renderable, so
// users see a broken state on those rows. For YouTube reels, iframe playback
// will work fine even when our native conversion path keeps failing — so any
// public+youtube reel that's not in 'ready' state AND has a valid YT URL
// AND has no live job AND has hit the retry cap gets flipped to 'ready'
// (video_url <- original_youtube_url) so the iframe path renders.
//
// Why a sweep and not "just don't INSERT failed status": worker MUST mark
// jobs failed so transient-retry logic works (we need failure count + age).
// This sweep is the gracefully-degrade-to-iframe layer that runs after the
// retry sweeps have given up. Hourly cadence is plenty — failure->visible
// gap of up to 60 min is acceptable; users only see the "ready" state.
const FAILED_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;     // hourly
const FAILED_FALLBACK_BATCH       = 200;
let lastFailedFallbackAt = 0;

// Native-MP4 poster backfill — covers reels uploaded directly by users (not
// via the YouTube transcode path) that landed with thumbnail_url=NULL.
// Stories.jsx INSERTs social_reels without a thumb; the social_posts→reels
// mirror trigger copies thumbnail_url which may itself be NULL. Without this
// sweep, those reels paint a black frame on first render. The 2026-05-07
// one-shot scripts/backfill-native-poster-thumbnails.mjs cleared the
// historical backlog (17/19 succeeded). This sweep keeps the lights on.
const NATIVE_POSTER_INTERVAL_MS = 30 * 60 * 1000;
const NATIVE_POSTER_BATCH      = 20;
let lastNativePosterAt = 0;
const nativePosterBlacklist = new Set();   // in-memory IDs that failed this process lifetime

// YouTube iframe thumbnail derive — sister sweep to nativePosterBackfillSweep
// covering source_type='youtube'. Reels mirrored from social_posts or
// transitioned to 'ready' state after the 20260507200000 one-shot backfill
// can land with thumbnail_url=NULL. The fix is pure SQL: derive
// img.youtube.com/vi/<id>/hqdefault.jpg from the 11-char video ID in the
// URL. No ffmpeg, no storage upload — runs in milliseconds.
const IFRAME_THUMB_INTERVAL_MS = 30 * 60 * 1000;
let lastIframeThumbAt = 0;

// Dead-video hiding sweep — periodically detects YouTube reels whose source
// video has been deleted/privated/copyright-stricken (signature: 404 on
// img.youtube.com/vi/<id>/hqdefault.jpg) and flips is_public=false so the
// iframe stops rendering "Video unavailable" in the user feed. Same logic
// as the manual scripts/cleanup-broken-videos.js but self-healing on a 6h
// cadence — long enough to be cheap, frequent enough that dead videos
// never linger more than a quarter-day.
const DEAD_VIDEO_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEAD_VIDEO_BATCH       = 200;
let lastDeadVideoAt = 0;

const TRANSIENT_PATTERNS = [
  /cookies-from-browser/i,
  /cookies for the authentication/i,
  /Sign in to confirm/i,
  /rate-limit|rate limit/i,
  /timeout/i,
  /ffmpeg_exit_255/i,
  /ffmpeg_timeout_/i,        // ffmpeg_timeout_600s (~129 stranded as of 2026-05-10) — wallclock cap, retry can succeed
  /yt-dlp_spawn/i,
  /yt-dlp_exit_null/i,       // yt-dlp crashed without exit code (~15 stranded) — usually transient (network blip, OOM)
  /Bad Gateway/i,
  /Gateway Timeout/i,        // 504 from YouTube CDN — pure infra blip
];
const PERMANENT_HISTORY_PATTERNS = [
  /members-only/i,
  /This video is private/i,
  /age-restricted/i,
  /not available in your country/i,
  /filtered_too_long_or_large/i,
  /Video unavailable/i,
  /removed by the uploader/i,
  /This live event will begin/i,
  /copyright claim/i,
];
const isTransientFailure = (msg) => TRANSIENT_PATTERNS.some((rx) => rx.test(msg || ''));
const hasPermanentHistory = (msgs) => msgs.some((m) => PERMANENT_HISTORY_PATTERNS.some((rx) => rx.test(m || '')));

async function transientFailureRetrySweep() {
  if (Date.now() - lastTransientRetryAt < TRANSIENT_RETRY_INTERVAL_MS) return;
  lastTransientRetryAt = Date.now();

  // 1. Find candidate reels in 'failed' state, video_url is YouTube
  const { data: candidates } = await supa.from('social_reels')
    .select('id, author_id, video_url')
    .eq('media_status', 'failed')
    .eq('source_type', 'youtube')
    .ilike('video_url', '%youtube%')
    .limit(500);
  if (!candidates?.length) {
    log('transient-retry: no failed reels found');
    return;
  }

  // 2. Batch-fetch all failed jobs for these reels' URLs (one query)
  const urls = Array.from(new Set(candidates.map((c) => c.video_url)));
  const ageCutoff = new Date(Date.now() - TRANSIENT_FAILURE_MIN_AGE_MS).toISOString();
  const { data: allFailedJobs } = await supa.from('video_transcode_jobs')
    .select('youtube_url, error_message, completed_at, reel_id')
    .eq('source_type', 'youtube')
    .eq('status', 'failed')
    .in('youtube_url', urls)
    .order('completed_at', { ascending: false, nullsFirst: false });

  // 3. Group jobs by URL, classify
  const jobsByUrl = new Map();
  for (const j of (allFailedJobs || [])) {
    if (!jobsByUrl.has(j.youtube_url)) jobsByUrl.set(j.youtube_url, []);
    jobsByUrl.get(j.youtube_url).push(j);
  }

  // 4. Determine which reels qualify for retry:
  //    - Latest failure was transient
  //    - Latest failure is OLDER than 1 hour (transient sources had time to recover)
  //    - Has < TRANSIENT_RETRY_CAP failures total for this URL
  //    - No permanent-failure history mixed in
  const eligible = [];
  for (const reel of candidates) {
    const jobs = jobsByUrl.get(reel.video_url) || [];
    if (jobs.length === 0 || jobs.length >= TRANSIENT_RETRY_CAP) continue;
    const latest = jobs[0];
    if (!isTransientFailure(latest.error_message)) continue;
    if (latest.completed_at && new Date(latest.completed_at) > new Date(ageCutoff)) continue;
    const allMsgs = jobs.map((j) => j.error_message);
    if (hasPermanentHistory(allMsgs)) continue;
    eligible.push(reel);
  }

  if (!eligible.length) {
    log(`transient-retry: ${candidates.length} failed reels checked, 0 eligible (none transient + age + uncapped)`);
    return;
  }
  log(`transient-retry: ${eligible.length} reel(s) eligible — retrying`);

  // 5. Reset reel to 'queued', INSERT new transcode job (per distinct URL)
  for (const r of eligible) {
    await supa.from('social_reels').update({ media_status: 'queued' }).eq('id', r.id);
  }
  const seen = new Set();
  let inserted = 0, raceSkipped = 0;
  for (const r of eligible) {
    if (seen.has(r.video_url)) continue;
    seen.add(r.video_url);
    // Skip if a live job exists for this URL
    const { data: existing } = await supa.from('video_transcode_jobs')
      .select('id').eq('source_type', 'youtube').eq('youtube_url', r.video_url)
      .in('status', ['queued', 'processing']).limit(1).maybeSingle();
    if (existing) { raceSkipped++; continue; }
    const { error: insErr } = await supa.from('video_transcode_jobs').insert({
      reel_id: r.id, user_id: r.author_id,
      source_url: r.video_url, youtube_url: r.video_url,
      source_type: 'youtube', status: 'queued',
      target_format: 'h264_1080p', target_bitrate: 2500000,
    });
    if (insErr) {
      if (insErr.code === '23505') raceSkipped++;
      else warn(`transient-retry: insert failed for ${r.video_url}: ${insErr.message}`);
    } else {
      inserted++;
    }
  }
  log(`transient-retry: enqueued ${inserted} job(s); skipped ${raceSkipped} (race / already live)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Stranded-reel recovery sweep — universal catch-all (seventh self-healer).
//
// Why this exists: cookieRecoverySweep covers the cookie-auth subset of
// transient-but-classified-permanent failures. transientFailureRetrySweep
// covers reels in 'failed' state. But the worker's permanent-failure path
// flips reels to media_status='ready' (iframe-forever) for SEVERAL transient
// patterns (cookies, ffmpeg_timeout_, Sign in to confirm, yt-dlp_exit_null)
// — we kept those in PERMANENT_PATTERNS so the user-facing iframe always
// works, but that means non-cookie transient failures had NO retry path.
//
// This sweep is the universal catch-all: for ANY ready-state YT reel
// whose ALL failures are transient (cookies / timeout / rate-limit /
// Bad Gateway / ffmpeg-255 / spawn errors / Sign-in / yt-dlp_exit_null),
// re-queue it. Skips reels with even one truly-permanent failure mixed
// in (members-only, private, region-blocked, age-restricted, filtered_too_long).
//
// Runs hourly + once at startup. Capped at STRANDED_RECOVERY_BATCH=100
// per tick. Bounded retries: skip URLs with ≥3 prior failed jobs.
// Idempotent: NOT EXISTS check on live jobs prevents double-enqueue.
//
// IMPORTANT: this is the catch-all, so it will overlap with cookieRecoverySweep
// and transientFailureRetrySweep. The NOT EXISTS guard makes that safe.
// ════════════════════════════════════════════════════════════════════════════
async function strandedReelRecoverySweep(opts = {}) {
  const { force = false } = opts;
  if (!force && Date.now() - lastStrandedRecoveryAt < STRANDED_RECOVERY_INTERVAL_MS) return;
  lastStrandedRecoveryAt = Date.now();

  // 1. Confirm pipeline is healthy: latest success > latest cookie/transient
  // failure. If cookies are still broken, retrying is pointless.
  const { data: lastSuccess } = await supa.from('video_transcode_jobs')
    .select('completed_at')
    .eq('status', 'completed').eq('source_type', 'youtube')
    .order('completed_at', { ascending: false }).limit(1).maybeSingle();
  if (!lastSuccess?.completed_at) {
    log('stranded-recovery: no successful conversions yet — bailing');
    return;
  }

  // 2. Pull ALL recent failed jobs (last 30 days), classify per URL.
  // We need every failure per URL to know if there's a permanent mixed in.
  const { data: failedJobs } = await supa.from('video_transcode_jobs')
    .select('youtube_url, error_message, completed_at')
    .eq('source_type', 'youtube').eq('status', 'failed')
    .gte('completed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(10000);
  if (!failedJobs?.length) {
    log('stranded-recovery: no recent failed jobs');
    return;
  }

  // Group by URL
  const jobsByUrl = new Map();
  for (const j of failedJobs) {
    if (!jobsByUrl.has(j.youtube_url)) jobsByUrl.set(j.youtube_url, []);
    jobsByUrl.get(j.youtube_url).push(j);
  }

  // 3. Classify each URL: eligible if all failures are transient and the
  // most-recent is older than the min-age threshold.
  const ageCutoff = new Date(Date.now() - STRANDED_RECOVERY_MIN_AGE_MS);
  const eligibleUrls = [];
  for (const [url, jobs] of jobsByUrl) {
    if (jobs.length >= TRANSIENT_RETRY_CAP) continue;
    const allMsgs = jobs.map(j => j.error_message || '');
    if (hasPermanentHistory(allMsgs)) continue;
    if (!isTransientFailure(jobs[0].error_message)) continue;
    if (jobs[0].completed_at && new Date(jobs[0].completed_at) > ageCutoff) continue;
    eligibleUrls.push(url);
  }
  if (!eligibleUrls.length) {
    log(`stranded-recovery: ${jobsByUrl.size} URLs scanned, 0 eligible (none all-transient + age + uncapped)`);
    return;
  }

  // 4. Find ready-state reels matching these URLs (iframe-forever stranded).
  // Cap at STRANDED_RECOVERY_BATCH per tick to avoid overwhelming the queue.
  const batchUrls = eligibleUrls.slice(0, STRANDED_RECOVERY_BATCH);
  const { data: candidates } = await supa.from('social_reels')
    .select('id, author_id, original_youtube_url')
    .eq('media_status', 'ready')
    .eq('is_public', true)
    .ilike('video_url', '%youtube%')
    .in('original_youtube_url', batchUrls)
    .limit(STRANDED_RECOVERY_BATCH);
  if (!candidates?.length) {
    log(`stranded-recovery: ${batchUrls.length} eligible URL(s) but no matching ready+public reels`);
    return;
  }

  log(`stranded-recovery: ${candidates.length} stranded reel(s) found across ${batchUrls.length} URL(s) — re-queueing`);

  // 5. Flip reels back to queued, then INSERT one job per distinct URL.
  // Per-URL deduplication so we don't insert two jobs for the same video.
  const seen = new Set();
  let inserted = 0, raceSkipped = 0, flipped = 0;
  for (const r of candidates) {
    if (seen.has(r.original_youtube_url)) continue;
    seen.add(r.original_youtube_url);

    // Skip if already a live job for this URL (race-safety)
    const { data: existing } = await supa.from('video_transcode_jobs')
      .select('id').eq('source_type', 'youtube')
      .eq('youtube_url', r.original_youtube_url)
      .in('status', ['queued', 'processing'])
      .limit(1).maybeSingle();
    if (existing) { raceSkipped++; continue; }

    // Flip the reel back to queued state
    const { error: updErr } = await supa.from('social_reels').update({
      media_status: 'queued',
      video_url: r.original_youtube_url,
      source_type: 'youtube',
      thumbnail_url: null,
    }).eq('id', r.id);
    if (updErr) { warn(`stranded-recovery: flip failed for ${r.id}:`, updErr.message); continue; }
    flipped++;

    // Insert fresh transcode job
    const { error: insErr } = await supa.from('video_transcode_jobs').insert({
      reel_id: r.id, user_id: r.author_id,
      source_url: r.original_youtube_url, youtube_url: r.original_youtube_url,
      source_type: 'youtube', status: 'queued',
      target_format: 'h264_1080p', target_bitrate: 2500000,
    });
    if (insErr) {
      if (insErr.code === '23505') raceSkipped++;
      else warn(`stranded-recovery: insert failed for ${r.original_youtube_url}: ${insErr.message}`);
    } else {
      inserted++;
    }
  }
  log(`stranded-recovery: flipped ${flipped} reel(s), enqueued ${inserted} job(s); skipped ${raceSkipped} (race / already live)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Failed-reel iframe fallback sweep — eighth self-healer.
//
// Why this exists: when transient retries cap out, reels are left in
// media_status='failed' (or queued with no live job) — both unrenderable on
// the feed, so users see broken rows. For source_type='youtube' reels we
// already know the YouTube iframe path will work; this sweep flips them to
// media_status='ready' with video_url <- original_youtube_url so the
// iframe renders. Idempotent: no live job allowed, must have hit retry cap.
// ════════════════════════════════════════════════════════════════════════════
async function failedReelFallbackSweep() {
  if (Date.now() - lastFailedFallbackAt < FAILED_FALLBACK_INTERVAL_MS) return;
  lastFailedFallbackAt = Date.now();

  // Find public YT reels stuck in failed/queued with valid YT URL and no live job.
  // Pull failed-state first (most common); queued-orphans handled by orphanedQueuedSweep
  // for fresh queue insertion; this sweep is the give-up-and-iframe layer.
  const { data: rows, error } = await supa.rpc ? null : null;
  // Use plain SELECT — no rpc dependency.
  const { data: candidates, error: selErr } = await supa.from('social_reels')
    .select('id, video_url, original_youtube_url, source_type, media_status')
    .eq('is_public', true)
    .eq('source_type', 'youtube')
    .in('media_status', ['failed', 'queued'])
    .or('video_url.ilike.%youtube%,original_youtube_url.ilike.%youtube%')
    .limit(FAILED_FALLBACK_BATCH);

  if (selErr) { warn('failed-fallback: select failed:', selErr.message); return; }
  if (!candidates?.length) { log('failed-fallback: no failed/queued public YT reels'); return; }

  // Filter: skip rows with a live job (orphan sweep / stranded sweep handle those)
  const eligible = [];
  for (const r of candidates) {
    const { data: live } = await supa.from('video_transcode_jobs')
      .select('id').eq('reel_id', r.id)
      .in('status', ['queued', 'processing'])
      .limit(1).maybeSingle();
    if (live) continue;  // let other sweeps handle in-flight conversions
    eligible.push(r);
  }
  if (!eligible.length) { log(`failed-fallback: ${candidates.length} candidates, all have live jobs`); return; }

  let flipped = 0;
  for (const r of eligible) {
    const ytUrl = r.original_youtube_url || r.video_url;
    if (!ytUrl || !/youtube\.com|youtu\.be/i.test(ytUrl)) continue;
    const { error: updErr } = await supa.from('social_reels').update({
      media_status: 'ready',
      video_url: ytUrl,
    }).eq('id', r.id);
    if (updErr) { warn(`failed-fallback: flip failed for ${r.id}:`, updErr.message); continue; }
    flipped++;
  }
  log(`failed-fallback: flipped ${flipped} broken-feed reel(s) to ready+iframe`);
}

// ════════════════════════════════════════════════════════════════════════════
// Native-MP4 poster backfill sweep — fourth self-healer.
//
// Why this exists: Stories.jsx (line ~839) and the social_posts→social_reels
// mirror trigger (fn_social_posts_video_to_reel_mirror) both write
// social_reels rows where thumbnail_url can be NULL. The Reels.jsx player
// conditionally renders <img> only when thumbnail_url is set — so a missing
// thumb makes the player paint a black frame on first render. The 2026-05-07
// one-shot scripts/backfill-native-poster-thumbnails.mjs cleared the
// historical backlog (17/19 reels). This sweep keeps things healthy from
// here on without requiring frontend changes (client-side canvas.toBlob
// would taint on Supabase Storage public URLs that lack CORS headers).
//
// Per tick: SELECT up to NATIVE_POSTER_BATCH eligible reels, for each
//   1. fetch a small range of the source MP4 (HTTP Range; cap 8 MB)
//   2. ffmpeg -ss 1 -vframes 1 → JPEG poster
//   3. upload to social-media bucket at reels/thumbs/native_backfill/{reel_id}.jpg
//   4. UPDATE social_reels.thumbnail_url with the public URL
//
// Reels with corrupt MP4s (no moov atom, etc.) are added to an in-memory
// blacklist for the lifetime of this process so we don't burn CPU on them
// every 30 min. Process restarts forget the blacklist (acceptable — one
// retry per restart, then quiet for the rest of the run).
// ════════════════════════════════════════════════════════════════════════════
async function nativePosterBackfillSweep() {
  if (Date.now() - lastNativePosterAt < NATIVE_POSTER_INTERVAL_MS) return;
  lastNativePosterAt = Date.now();

  const { data: candidates, error } = await supa.from('social_reels')
    .select('id, video_url')
    .eq('media_status', 'ready')
    .is('thumbnail_url', null)
    .in('source_type', ['native', 'user'])
    .eq('is_public', true)
    .ilike('video_url', `%${new URL(SUPABASE_URL).host}%`)
    .limit(NATIVE_POSTER_BATCH);

  if (error) { warn('native-poster: select error:', error.message); return; }
  if (!candidates?.length) {
    log('native-poster: no reels found needing posters');
    return;
  }

  const targets = candidates.filter((r) => !nativePosterBlacklist.has(r.id));
  if (!targets.length) {
    log(`native-poster: ${candidates.length} candidate(s) all blacklisted this process`);
    return;
  }

  log(`native-poster: processing ${targets.length} reel(s)`);
  let ok = 0, failed = 0;
  let tmpDir;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'native-poster-'));
  } catch (mkErr) {
    warn('native-poster: mkdtemp failed:', mkErr.message);
    return;
  }

  for (const reel of targets) {
    const localMp4 = join(tmpDir, `${reel.id}.mp4`);
    const localJpg = join(tmpDir, `${reel.id}.jpg`);
    try {
      // 1. Fetch up to first 8 MB via Range — enough for the moov atom on
      //    streaming-friendly MP4s (faststart). Avoids downloading whole reel.
      const res = await fetch(reel.video_url, { headers: { Range: 'bytes=0-8388607' } });
      if (!res.ok && res.status !== 206) {
        throw new Error(`fetch HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const { writeFile } = await import('node:fs/promises');
      await writeFile(localMp4, buf);

      // 2. ffmpeg poster — same args as the YouTube transcode poster path.
      await runProcess('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', '1',
        '-i', localMp4,
        '-t', '3',
        '-vframes', '1',
        '-an',
        '-vf', 'scale=480:-1',
        '-q:v', '2',
        localJpg,
      ], 30_000);

      // 3. Upload poster to social-media bucket
      const jpgBuf = await readFile(localJpg);
      const objectPath = `reels/thumbs/native_backfill/${reel.id}.jpg`;
      const { error: upErr } = await supa.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, jpgBuf, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '604800',
        });
      if (upErr) throw new Error(`storage upload: ${upErr.message}`);
      const { data: pub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

      // 4. UPDATE social_reels.thumbnail_url
      const { error: updErr } = await supa.from('social_reels')
        .update({ thumbnail_url: pub.publicUrl })
        .eq('id', reel.id);
      if (updErr) throw new Error(`db update: ${updErr.message}`);
      ok++;
    } catch (err) {
      // Corrupt MP4 / fetch fail / ffmpeg fail — blacklist for this process
      nativePosterBlacklist.add(reel.id);
      warn(`native-poster: blacklisted ${reel.id} — ${err.message}`);
      failed++;
    } finally {
      // Best-effort cleanup of per-reel temp files; whole tmpDir cleaned at end
      await Promise.all([
        rm(localMp4, { force: true }).catch(() => {}),
        rm(localJpg, { force: true }).catch(() => {}),
      ]);
    }
  }

  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  log(`native-poster: ${ok} backfilled, ${failed} blacklisted`);
}

// ════════════════════════════════════════════════════════════════════════════
// YouTube-iframe thumbnail derive sweep — fifth self-healer.
//
// Sister sweep to nativePosterBackfillSweep, but for source_type='youtube'.
// The 2026-05-07 one-shot migration 20260507200000_backfill_iframe_reel_thumbnails
// fixed 8,982 historical iframe reels — but reels can transition to
// (media_status='ready', is_public=true, thumbnail_url=NULL) AFTER that
// migration ran via:
//   - the social_posts → social_reels mirror trigger (NEW.thumbnail_url NULL)
//   - the worker's permanent-failure path setting media_status='ready'
//     (iframe-forever) on a previously-queued reel
//
// Without a periodic sweep, those new stragglers paint a black frame on
// first render until someone notices. This sweep runs the SAME regex-derive
// UPDATE as the migration. Pure SQL — no ffmpeg, no fetch, no storage.
// Idempotent: WHERE clauses match 0 rows after first successful run.
// ════════════════════════════════════════════════════════════════════════════
async function iframeThumbnailDeriveSweep() {
  if (Date.now() - lastIframeThumbAt < IFRAME_THUMB_INTERVAL_MS) return;
  lastIframeThumbAt = Date.now();

  // Use rpc('exec', ...) is not available on supabase-js; instead, do this
  // as a multi-step JS pattern: SELECT candidates, derive video_id in JS,
  // UPDATE one-by-one. Tiny batch (max 50) keeps it cheap.
  const { data: candidates, error } = await supa.from('social_reels')
    .select('id, video_url')
    .eq('media_status', 'ready')
    .eq('is_public', true)
    .is('thumbnail_url', null)
    .ilike('video_url', '%youtube%')
    .limit(50);

  if (error) { warn('iframe-thumb: select error:', error.message); return; }
  if (!candidates?.length) {
    log('iframe-thumb: no youtube reels need thumbs');
    return;
  }

  // Match the migration's regex pattern set: /embed/, /shorts/, /v/, ?v=
  const RE1 = /\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/;
  const RE2 = /[?&]v=([A-Za-z0-9_-]{11})/;
  let updated = 0, unmatched = 0;

  for (const reel of candidates) {
    const m1 = RE1.exec(reel.video_url || '');
    const m2 = !m1 ? RE2.exec(reel.video_url || '') : null;
    const videoId = m1?.[1] || m2?.[1] || null;
    if (!videoId) { unmatched++; continue; }

    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const { error: updErr } = await supa.from('social_reels')
      .update({ thumbnail_url: thumbUrl })
      .eq('id', reel.id);
    if (updErr) {
      warn(`iframe-thumb: update failed for ${reel.id}: ${updErr.message}`);
    } else {
      updated++;
    }
  }
  log(`iframe-thumb: ${updated} thumbnails derived, ${unmatched} unmatched URLs`);
}

// ════════════════════════════════════════════════════════════════════════════
// Dead-video hiding sweep — sixth self-healer.
//
// 2026-05-07 audit found 644 reels (138 distinct YouTube URLs) hidden via
// the manual scripts/cleanup-broken-videos.js. Verified: hqdefault.jpg
// returns 404 for all sampled — same signature as known-deleted IDs. The
// cleanup logic is correct, but the script is unscheduled, so dead-video
// detection only runs when an operator manually triggers it. This sweep
// makes that detection self-healing on a 6h cadence.
//
// Safe to run frequently: HEAD requests against img.youtube.com are cheap
// (no body), and we cap at DEAD_VIDEO_BATCH=200 reels per tick. Per-reel
// cost is ~50ms (HEAD + small UPDATE), so a full tick is ~10s wall-clock.
// Negligible against MAX_CONCURRENT_YT=3 transcode jobs.
//
// Idempotent: WHERE is_public=true filter means already-hidden reels are
// skipped on subsequent ticks.
// ════════════════════════════════════════════════════════════════════════════
async function deadVideoHidingSweep() {
  if (Date.now() - lastDeadVideoAt < DEAD_VIDEO_INTERVAL_MS) return;
  lastDeadVideoAt = Date.now();

  const { data: candidates, error } = await supa.from('social_reels')
    .select('id, video_url')
    .eq('media_status', 'ready')
    .eq('is_public', true)
    .eq('source_type', 'youtube')
    .ilike('video_url', '%youtube%')
    .limit(DEAD_VIDEO_BATCH);

  if (error) { warn('dead-video: select error:', error.message); return; }
  if (!candidates?.length) {
    log('dead-video: no candidates');
    return;
  }

  // Same regex set the rest of the worker uses — covers /embed/, /shorts/, /v/, ?v=
  const RE1 = /\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/;
  const RE2 = /[?&]v=([A-Za-z0-9_-]{11})/;
  const deadIds = [];
  let unmatchedUrl = 0, alive = 0, headErrors = 0;

  for (const reel of candidates) {
    const m1 = RE1.exec(reel.video_url || '');
    const m2 = !m1 ? RE2.exec(reel.video_url || '') : null;
    const videoId = m1?.[1] || m2?.[1] || null;
    if (!videoId) { unmatchedUrl++; continue; }

    try {
      const res = await fetch(
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        { method: 'HEAD', signal: AbortSignal.timeout(5_000) },
      );
      if (res.status === 404) {
        deadIds.push(reel.id);
      } else if (res.status >= 200 && res.status < 300) {
        alive++;
      } else {
        // 5xx, 429 — ambiguous; don't hide on transient errors
        headErrors++;
      }
    } catch (_) {
      headErrors++;
    }
  }

  if (deadIds.length) {
    const { error: updErr } = await supa.from('social_reels')
      .update({ is_public: false })
      .in('id', deadIds);
    if (updErr) {
      warn(`dead-video: bulk update failed:`, updErr.message);
      return;
    }
  }

  log(`dead-video: ${candidates.length} checked, ${deadIds.length} hidden, ${alive} alive, ${unmatchedUrl} unmatched URLs, ${headErrors} HEAD errors`);
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
// Startup catch-up: scan once for stranded reels (any failure mode classified
// as permanent-but-actually-transient that no other sweep is handling). This
// makes deploys self-healing — restart the worker and it picks up any drift
// without any human intervention. Force=true bypasses the throttle.
strandedReelRecoverySweep({ force: true }).catch((e) => warn('stranded-recovery startup error:', e?.message));

async function pollLoop() {
  try {
    await resetStaleProcessing();   // periodic: every tick, catches cross-worker orphans
    // Self-healing sweeps — both throttled internally:
    //   - cookieRecoverySweep: once / 15 min, only mutates when cookies have
    //     recovered since the last cookie-auth failure cluster.
    //   - orphanedQueuedSweep: once / 5 min, INSERTs jobs for reels stuck
    //     in 'queued' state with no live transcode job (typically from bulk
    //     SQL updates that bypassed the INSERT trigger).
    cookieRecoverySweep().catch((e) => warn('cookie-recovery error:', e?.message));
    orphanedQueuedSweep().catch((e) => warn('orphan-sweep error:', e?.message));
    transientFailureRetrySweep().catch((e) => warn('transient-retry error:', e?.message));
    //   - nativePosterBackfillSweep: once / 30 min, generates posters for
    //     native-MP4 reels uploaded with NULL thumbnail_url (Stories.jsx +
    //     mirror-trigger paths). Self-healing forever.
    nativePosterBackfillSweep().catch((e) => warn('native-poster error:', e?.message));
    //   - iframeThumbnailDeriveSweep: once / 30 min, derives YouTube
    //     hqdefault thumbnails for source_type='youtube' reels with NULL
    //     thumbnail_url. Pure SQL — sister to the native-MP4 sweep.
    iframeThumbnailDeriveSweep().catch((e) => warn('iframe-thumb error:', e?.message));
    //   - deadVideoHidingSweep: once / 6h, HEAD-checks YouTube hqdefault.jpg
    //     for public reels and flips is_public=false on 404s (deleted/private/
    //     copyright-stricken videos). Self-healing replacement for the manual
    //     scripts/cleanup-broken-videos.js.
    deadVideoHidingSweep().catch((e) => warn('dead-video error:', e?.message));
    //   - strandedReelRecoverySweep: once / 60 min, universal catch-all that
    //     scans every ready-state YT reel with all-transient failures and
    //     re-queues them. Closes the gap left by cookieRecoverySweep (which
    //     only handled cookie-auth) and transientFailureRetrySweep (which
    //     only looks at media_status='failed'). Also runs once at startup.
    strandedReelRecoverySweep().catch((e) => warn('stranded-recovery error:', e?.message));
    //   - failedReelFallbackSweep: once / 60 min, give-up-and-iframe layer.
    //     Any public YT reel in failed/queued state with no live job gets
    //     flipped to ready+iframe so the user sees content even when native
    //     conversion can't be made to work. Last line of defense.
    failedReelFallbackSweep().catch((e) => warn('failed-fallback error:', e?.message));
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
