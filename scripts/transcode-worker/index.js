/**
 * SMARTER POKER — Video Transcode Worker v1.0
 * scripts/transcode-worker/index.js
 *
 * Polls social_posts for transcode_status='queued' every 60 seconds.
 * Downloads the original video (typically HEVC/H.265 .mov from iPhone),
 * transcodes to H.264/AAC MP4 via ffmpeg, uploads the result to Supabase
 * Storage, and updates both social_posts and social_reels.
 *
 * Runs as a systemd service on the openclaw-dispatcher Hetzner VM
 * (server id 127861894, nbg1). The YouTube/MP4 sibling worker
 * (sp-yt-transcode.service) lives on the dedicated reels-transcode-worker
 * VM (server id 128782737, ash) — not on this box.
 *
 * Environment:
 *   SUPABASE_SERVICE_ROLE_KEY — required
 *   NEXT_PUBLIC_SUPABASE_URL  — optional, defaults to production
 *
 * Requirements:
 *   - ffmpeg in $PATH (apt install ffmpeg)
 *   - Node.js >= 18 (for native fetch + fs/promises)
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

// ─── Logging ─────────────────────────────────────────────────────────────────
const log = (...args) => console.log(`[transcode ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[transcode ${new Date().toISOString()}]`, ...args);

// ─── Core transcode loop ─────────────────────────────────────────────────────
async function tick() {
  // Grab the oldest queued video post
  const { data: posts, error } = await supa
    .from('social_posts')
    .select('id, author_id, media_urls, original_media_url, transcode_status')
    .eq('transcode_status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) { warn('poll error:', error.message); return; }
  if (!posts || posts.length === 0) return; // Nothing to do

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
    // ── 1. Download ─────────────────────────────────────────────────────────
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

    // ── 2. Probe codec (skip transcode if already H.264) ────────────────────
    const probeResult = await probeCodec(inFile);
    if (probeResult === 'h264') {
      log('  Already H.264 — marking done without re-encoding');
      // If it's .mov but already H.264, just re-mux to .mp4 (fast copy)
      await remuxToMp4(inFile, outFile);
    } else {
      // ── 3. Transcode — H.264 baseline + AAC, web-safe ──────────────────
      log(`  Transcoding (codec: ${probeResult})...`);
      await transcode(inFile, outFile);
    }

    const outStat = await stat(outFile);
    const outSizeMB = (outStat.size / (1024 * 1024)).toFixed(1);
    log(`  Output: ${outSizeMB} MB`);

    // ── 4. Upload to Supabase Storage ──────────────────────────────────────
    const originalPath = (post.media_urls?.[0] || srcUrl)
      .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/social-media\//, '');
    const newPath = originalPath
      .replace(/\.(mov|hevc|heic|mkv|avi|m4v|3gpp?|3g2)(\?.*)?$/i, '.mp4');

    log(`  Uploading to ${newPath}...`);
    const file = await readFile(outFile);
    const { error: upErr } = await supa.storage
      .from('social-media')
      .upload(newPath, file, {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from('social-media').getPublicUrl(newPath);
    const newUrl = pub.publicUrl;

    // ── 5. Update database rows ────────────────────────────────────────────
    const newMediaUrls = [newUrl, ...(post.media_urls || []).slice(1)];
    await supa.from('social_posts').update({
      media_urls: newMediaUrls,
      transcode_status: 'done',
      transcode_error: null,
      original_media_url: srcUrl,
    }).eq('id', post.id);

    // Mirror update to social_reels (if this post has a reel entry)
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
    // Clean up temp files
    try { await rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ─── ffmpeg helpers ──────────────────────────────────────────────────────────

/**
 * Probe the video codec of a file using ffprobe.
 * Returns 'h264', 'hevc', 'unknown', etc.
 */
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

/**
 * Fast re-mux (no re-encoding) from .mov to .mp4 with faststart.
 * Used when the codec is already H.264 but the container is .mov.
 */
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
    // Timeout
    const timer = setTimeout(() => {
      ff.kill('SIGTERM');
      reject(new Error('remux_timeout'));
    }, FFMPEG_TIMEOUT);
    ff.on('close', () => clearTimeout(timer));
  });
}

/**
 * Full transcode: HEVC/whatever → H.264 baseline + AAC + faststart.
 * This is the most cross-compatible web container — plays on every browser
 * since Safari 5 / Chrome 4.
 */
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
    // Timeout
    const timer = setTimeout(() => {
      ff.kill('SIGTERM');
      reject(new Error('ffmpeg_timeout_10min'));
    }, FFMPEG_TIMEOUT);
    ff.on('close', () => clearTimeout(timer));
  });
}

// ─── Crash recovery: reset any 'running' rows back to 'queued' on startup ───
async function resetStaleRunning() {
  const { data, error } = await supa.from('social_posts')
    .update({ transcode_status: 'queued', transcode_error: 'worker_restarted' })
    .eq('transcode_status', 'running')
    .select('id');
  if (data?.length) {
    log(`Reset ${data.length} stale 'running' row(s) back to 'queued'`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
log('Starting transcode worker');
log(`  Supabase: ${SUPABASE_URL}`);
log(`  Poll interval: ${POLL_MS / 1000}s`);
log(`  Max file size: ${MAX_FILE_SIZE / (1024 * 1024)} MB`);

await resetStaleRunning();
await tick(); // First poll immediately
setInterval(() => tick().catch((e) => warn('tick error:', e)), POLL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received — shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  log('SIGINT received — shutting down');
  process.exit(0);
});
