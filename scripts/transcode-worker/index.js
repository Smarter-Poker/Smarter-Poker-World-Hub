/**
 * SMARTER POKER — Video Transcode Worker v2.0 (Operation TikTok Reels)
 * scripts/transcode-worker/index.js
 *
 * Two pollers run on the same systemd unit (sp-transcode.service) on Hetzner:
 *
 *   1. tick()        — polls social_posts.transcode_status='queued' (HEVC
 *                       user-upload pipeline, unchanged from v1.0). Competes
 *                       optimistically with the Vercel cron at
 *                       /api/cron/transcode-videos via atomic UPDATE.
 *
 *   2. tickYoutube() — NEW. Polls video_transcode_jobs WHERE
 *                       source_type='youtube' AND status='queued'. Hetzner-
 *                       only because it requires yt-dlp + python3 (not
 *                       available on Vercel serverless). Up to 3 jobs run
 *                       in parallel inside one process; downloads are slow
 *                       (~30–90 s) so concurrency keeps the box busy without
 *                       saturating bandwidth.
 *
 * On YouTube job success:
 *   - social_reels.video_url is rewritten to the Supabase public URL
 *   - social_reels.source_type flips from 'youtube' to 'native'
 *   - social_reels.media_status flips to 'ready'
 *   - video_transcode_jobs row marked status='completed'
 *
 * On YouTube job failure (yt-dlp can't reach a private/deleted/region-blocked
 * video, ffmpeg explodes, upload 5xx, etc.):
 *   - social_reels.media_status flips to 'failed'
 *   - video_url stays the original YouTube URL — the iframe player keeps
 *     working, no user impact
 *   - video_transcode_jobs row marked status='failed' with error_message
 *
 * Environment:
 *   SUPABASE_SERVICE_ROLE_KEY — required
 *   NEXT_PUBLIC_SUPABASE_URL  — optional, defaults to production
 *   WORKER_ID                 — optional, defaults to hostname
 *   MAX_CONCURRENT_YT         — optional, defaults to 3
 *
 * Requirements (system packages):
 *   - ffmpeg + ffprobe in $PATH    (apt install ffmpeg)
 *   - yt-dlp in $PATH              (pip3 install yt-dlp)
 *   - python3                      (apt install python3)
 *   - Node.js >= 18 (native fetch + fs/promises + top-level await)
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('[transcode] FATAL: missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY);
const POLL_MS = 60_000;          // Poll every 60 seconds
const MAX_FILE_SIZE = 500_000_000; // 500 MB — skip files larger than this
const FFMPEG_TIMEOUT = 600_000;  // 10 minutes max per transcode
const STORAGE_BUCKET = 'social-media';

// YouTube pipeline limits
const WORKER_ID = process.env.WORKER_ID || `hetzner-${hostname()}`;
const MAX_CONCURRENT_YT = Number(process.env.MAX_CONCURRENT_YT) || 3;
const YT_DOWNLOAD_TIMEOUT = 300_000; // 5 min per yt-dlp call

// In-flight YouTube job counter (fire-and-forget pattern inside tickYoutube())
let activeYtJobs = 0;

// ─── Logging ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(`[transcode ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[transcode ${new Date().toISOString()}]`, ...args);

// ════════════════════════════════════════════════════════════════════════════
// HEVC user-upload pipeline (UNCHANGED from v1.0 — preserves all existing
// behaviour including back-prop to social_reels.video_url for posts that
// have a source_post_id mirror).
// ════════════════════════════════════════════════════════════════════════════
async function tick() {
  const { data: posts, error } = await supa
    .from('social_posts')
    .select('id, author_id, media_urls, original_media_url, transcode_status')
    .eq('transcode_status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) { warn('poll error:', error.message); return; }
  if (!posts || posts.length === 0) return;

  const post = posts[0];
  const srcUrl = post.original_media_url || post.media_urls?.[0];
  if (!srcUrl) {
    await supa.from('social_posts')
      .update({ transcode_status: 'failed', transcode_error: 'no source URL' })
      .eq('id', post.id);
    return;
  }

  log(`Processing post ${post.id} — src: ${srcUrl.slice(-60)}`);
  await supa.from('social_posts')
    .update({ transcode_status: 'running' })
    .eq('id', post.id);

  const dir = await mkdtemp(join(tmpdir(), 'tx-'));
  const inFile = join(dir, 'input.mov');
  const outFile = join(dir, 'output.mp4');

  try {
    log('  Downloading...');
    const r = await fetch(srcUrl);
    if (!r.ok) throw new Error(`download_status_${r.status}`);

    const contentLength = parseInt(r.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_SIZE) {
      throw new Error(`file_too_large_${contentLength}_bytes`);
    }

    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(inFile, buf);
    const fileSizeMB = (buf.length / (1024 * 1024)).toFixed(1);
    log(`  Downloaded ${fileSizeMB} MB`);

    const probeResult = await probeCodec(inFile);
    if (probeResult === 'h264') {
      log('  Already H.264 — marking done without re-encoding');
      await remuxToMp4(inFile, outFile);
    } else {
      log(`  Transcoding (codec: ${probeResult})...`);
      await transcode(inFile, outFile);
    }

    const outStat = await stat(outFile);
    const outSizeMB = (outStat.size / (1024 * 1024)).toFixed(1);
    log(`  Output: ${outSizeMB} MB`);

    const originalPath = (post.media_urls?.[0] || srcUrl)
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/social-media\//, '');
    const newPath = originalPath
      .replace(/\.(mov|hevc|heic|mkv|avi|m4v|3gpp?|3g2)(\?.*)?$/i, '.mp4');

    log(`  Uploading to ${newPath}...`);
    const file = await readFile(outFile);
    const { error: upErr } = await supa.storage
      .from(STORAGE_BUCKET)
      .upload(newPath, file, {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(newPath);
    const newUrl = pub.publicUrl;

    const newMediaUrls = [newUrl, ...(post.media_urls || []).slice(1)];
    await supa.from('social_posts').update({
      media_urls: newMediaUrls,
      transcode_status: 'done',
      transcode_error: null,
      original_media_url: srcUrl,
    }).eq('id', post.id);

    await supa.from('social_reels')
      .update({ video_url: newUrl })
      .eq('source_post_id', post.id);

    log(`✓ Transcoded post ${post.id} → ${newUrl}`);

  } catch (e) {
    warn(`✗ Failed post ${post.id}:`, e.message);
    await supa.from('social_posts').update({
      transcode_status: 'failed',
      transcode_error: (e.message || String(e)).slice(0, 500),
    }).eq('id', post.id);
  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// YouTube → native MP4 pipeline (NEW — Operation TikTok Reels M1b)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Atomically claim the oldest queued YouTube job. Sets status='processing',
 * worker_id=this box, started_at=now. Returns the claimed row, or null if
 * nothing was queued (or another worker grabbed it first).
 */
async function claimYouTubeJob() {
  const { data: candidates, error } = await supa
    .from('video_transcode_jobs')
    .select('id, reel_id, user_id, youtube_url, source_url')
    .eq('status', 'queued')
    .eq('source_type', 'youtube')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) { warn('[yt] poll error:', error.message); return null; }
  if (!candidates || candidates.length === 0) return null;

  const candidate = candidates[0];

  // Atomic claim — UPDATE only succeeds if status is still 'queued'.
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

  if (claimErr) { warn('[yt] claim error:', claimErr.message); return null; }
  return claimed; // null if another worker claimed it between SELECT and UPDATE
}

/**
 * Download → re-encode → upload → DB update for one YouTube job.
 * Failures here mark the reel media_status='failed' and the job 'failed',
 * but the reel keeps playing as a YouTube iframe — no user-facing breakage.
 */
async function processYouTubeJob(job) {
  const ytUrl = job.youtube_url || job.source_url;
  const dir = await mkdtemp(join(tmpdir(), `yt-${job.id}-`));
  const rawFile = join(dir, 'raw.mp4');
  const outFile = join(dir, 'out.mp4');

  log(`[yt] Processing job ${job.id} — ${ytUrl}`);

  try {
    // ── 1. Download via yt-dlp at <=1080p, MP4 container preferred ─────────
    // Format selector: best video <=1080p + best m4a audio, falling back
    // through MP4-only and finally any container. --merge-output-format mp4
    // forces ffmpeg merge to MP4 if separate streams are returned.
    await runProcess('yt-dlp', [
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      '-o', rawFile,
      ytUrl,
    ], YT_DOWNLOAD_TIMEOUT);

    const rawStat = await stat(rawFile);
    if (rawStat.size > MAX_FILE_SIZE) {
      throw new Error(`raw_too_large_${rawStat.size}_bytes`);
    }
    log(`[yt] Downloaded ${(rawStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 2. Re-encode for web playback ──────────────────────────────────────
    // Same ladder pattern as the cron transcoder so YouTube-converted reels
    // look indistinguishable from user-uploaded ones in the feed.
    //   • 1080p cap on the LONGER edge (preserves portrait/landscape)
    //   • libx264 main profile / level 4.0 (universal device support)
    //   • AAC 128 kb/s
    //   • +faststart (moov atom at front so playback can start streaming)
    const SCALE_1080P =
      "scale='if(gt(iw,ih), min(1920,iw), -2)':'if(gt(iw,ih), -2, min(1920,ih))'";
    await runProcess('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', rawFile,
      '-vf', SCALE_1080P,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outFile,
    ], FFMPEG_TIMEOUT);

    const outStat = await stat(outFile);
    log(`[yt] Re-encoded → ${(outStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 3. Upload to social-media bucket ──────────────────────────────────
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

    // ── 4. Flip the reel from youtube → native ────────────────────────────
    if (job.reel_id) {
      const { error: reelErr } = await supa.from('social_reels').update({
        video_url: publicUrl,
        source_type: 'native',
        media_status: 'ready',
      }).eq('id', job.reel_id);
      if (reelErr) warn(`[yt] reel update warn (job ${job.id}):`, reelErr.message);
    }

    // ── 5. Mark job done ───────────────────────────────────────────────────
    await supa.from('video_transcode_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_url: publicUrl,
      error_message: null,
    }).eq('id', job.id);

    log(`[yt] ✓ Job ${job.id} → ${publicUrl}`);

  } catch (err) {
    const msg = (err?.message || String(err)).slice(0, 500);
    warn(`[yt] ✗ Job ${job.id} failed:`, msg);

    // Reel stays as YouTube iframe; just mark the status so future runs
    // don't retry forever. The backfill script can re-queue if desired.
    if (job.reel_id) {
      await supa.from('social_reels')
        .update({ media_status: 'failed' })
        .eq('id', job.reel_id)
        .catch(() => {});
    }

    await supa.from('video_transcode_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: msg,
    }).eq('id', job.id).catch(() => {});

  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

/**
 * Fire-and-forget: claim up to MAX_CONCURRENT_YT jobs and dispatch each in
 * parallel. Returns immediately after dispatching — does NOT wait for the
 * jobs to finish. Each job decrements activeYtJobs in its `.finally()`.
 *
 * The next setInterval tick will fire 60 s later and dispatch more if any
 * slot is free. Long-running downloads keep their slot held; a stuck job
 * is killed by YT_DOWNLOAD_TIMEOUT (5 min) inside processYouTubeJob().
 */
async function tickYoutube() {
  while (activeYtJobs < MAX_CONCURRENT_YT) {
    const job = await claimYouTubeJob();
    if (!job) break; // queue empty, no work to dispatch this tick

    activeYtJobs++;
    // Fire and forget — do NOT await
    processYouTubeJob(job)
      .catch((e) => warn('[yt] uncaught processYouTubeJob:', e?.message))
      .finally(() => { activeYtJobs--; });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ffmpeg helpers (for HEVC pipeline) + generic process runner (for yt-dlp)
// ════════════════════════════════════════════════════════════════════════════

function probeCodec(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => resolve(out.trim().toLowerCase() || 'unknown'));
  });
}

function remuxToMp4(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', inPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', outPath,
    ]);
    ff.stderr.on('data', (d) => process.stdout.write(d));
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`remux_exit_${code}`)));
    const timer = setTimeout(() => {
      ff.kill('SIGTERM');
      reject(new Error('remux_timeout'));
    }, FFMPEG_TIMEOUT);
    ff.on('close', () => clearTimeout(timer));
  });
}

function transcode(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', inPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'baseline',
      '-level', '3.1',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outPath,
    ]);
    ff.stderr.on('data', (d) => process.stdout.write(d));
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg_exit_${code}`)));
    const timer = setTimeout(() => {
      ff.kill('SIGTERM');
      reject(new Error('ffmpeg_timeout_10min'));
    }, FFMPEG_TIMEOUT);
    ff.on('close', () => clearTimeout(timer));
  });
}

/**
 * Generic process runner used by the YouTube pipeline (yt-dlp + ffmpeg).
 * Captures stderr tail in the rejected error so failures are diagnosable
 * without trawling journalctl.
 */
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
// Crash recovery — reset stale claimed-but-not-finished rows on startup
// ════════════════════════════════════════════════════════════════════════════

async function resetStaleRunning() {
  // HEVC pipeline (existing)
  const { data: hevc } = await supa.from('social_posts')
    .update({ transcode_status: 'queued', transcode_error: 'worker_restarted' })
    .eq('transcode_status', 'running')
    .select('id');
  if (hevc?.length) log(`Reset ${hevc.length} stale HEVC 'running' row(s)`);

  // YouTube pipeline — only reset rows owned by THIS worker; another box
  // might still be processing them legitimately.
  const { data: yt } = await supa.from('video_transcode_jobs')
    .update({ status: 'queued', error_message: 'worker_restarted' })
    .eq('status', 'processing')
    .eq('worker_id', WORKER_ID)
    .select('id');
  if (yt?.length) log(`Reset ${yt.length} stale YT 'processing' row(s)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Main loop
// ════════════════════════════════════════════════════════════════════════════
log('Starting transcode worker v2.0');
log(`  Worker ID:        ${WORKER_ID}`);
log(`  Supabase:         ${SUPABASE_URL}`);
log(`  Poll interval:    ${POLL_MS / 1000}s`);
log(`  Max file size:    ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
log(`  YT concurrency:   ${MAX_CONCURRENT_YT}`);

await resetStaleRunning();

// First poll immediately (HEVC + YouTube in parallel)
await Promise.allSettled([
  tick().catch((e) => warn('tick error:', e)),
  tickYoutube().catch((e) => warn('tickYoutube error:', e)),
]);

setInterval(() => {
  tick().catch((e) => warn('tick error:', e));
  tickYoutube().catch((e) => warn('tickYoutube error:', e));
}, POLL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received — shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  process.exit(0);
});
