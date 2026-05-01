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
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

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

// ─── Logging ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(`[yt-worker ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[yt-worker ${new Date().toISOString()}]`, ...args);

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
    await runProcess('yt-dlp', [
      '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--restrict-filenames',
      // Use iOS + web player clients — avoids cookie requirement on headless servers
      '--extractor-args', 'youtube:player_client=ios,web',
      '-o', rawFile,
      ytUrl,
    ], YT_DOWNLOAD_TIMEOUT);

    const rawStat = await stat(rawFile);
    if (rawStat.size > MAX_FILE_SIZE) {
      throw new Error(`raw_too_large_${rawStat.size}_bytes`);
    }
    log(`  Downloaded ${(rawStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 2. Re-encode for web (matches cron transcoder output ladder) ────────
    // Cap longer edge at 1080, libx264 main / level 4.0, AAC 128k, +faststart
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
    log(`  Re-encoded → ${(outStat.size / 1_048_576).toFixed(1)} MB`);

    // ── 3. Upload to social-media bucket ────────────────────────────────────
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

    // ── 4. Flip the reel: youtube → native ──────────────────────────────────
    if (job.reel_id) {
      const { error: reelErr } = await supa.from('social_reels').update({
        video_url: publicUrl,
        source_type: 'native',
        media_status: 'ready',
      }).eq('id', job.reel_id);
      if (reelErr) warn(`  reel update warn (job ${job.id}):`, reelErr.message);
    }

    // ── 5. Mark job done ────────────────────────────────────────────────────
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

    // Reel stays as YouTube iframe — backfill --requeue-failed can retry later.
    if (job.reel_id) {
      // Supabase v2: query builder is not a Promise — must await, not .catch()
      const { error: reelFailErr } = await supa.from('social_reels')
        .update({ media_status: 'failed' })
        .eq('id', job.reel_id);
      if (reelFailErr) warn(`  reel fail-mark warn:`, reelFailErr.message);
    }
    const { error: jobFailErr } = await supa.from('video_transcode_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: msg,
    }).eq('id', job.id);
    if (jobFailErr) warn(`  job fail-mark warn:`, jobFailErr.message);

  } finally {
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Tick: claim up to MAX_CONCURRENT_YT jobs and dispatch in parallel.
// Fire-and-forget — does NOT await jobs to finish, lets them run concurrently.
// ════════════════════════════════════════════════════════════════════════════
async function tick() {
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
// Crash recovery — reset stale 'processing' rows owned by THIS worker only
// (don't touch rows another worker may still be processing).
// ════════════════════════════════════════════════════════════════════════════
async function resetStaleProcessing() {
  const { data, error } = await supa.from('video_transcode_jobs')
    .update({ status: 'queued', error_message: 'worker_restarted' })
    .eq('status', 'processing')
    .eq('worker_id', WORKER_ID)
    .eq('source_type', 'youtube')
    .select('id');
  if (error) warn('stale reset error:', error.message);
  if (data?.length) log(`Reset ${data.length} stale 'processing' row(s)`);
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

await resetStaleProcessing();

async function pollLoop() {
  try {
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
process.on('SIGTERM', () => {
  log('SIGTERM received — shutting down (active jobs continue until they finish or die)');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  process.exit(0);
});
