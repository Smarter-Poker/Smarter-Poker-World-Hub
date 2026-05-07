#!/usr/bin/env node
/**
 * scripts/backfill-native-poster-thumbnails.mjs
 *
 * One-shot backfill for the small population of native-MP4 reels that have
 * media_status='ready' but thumbnail_url IS NULL. These were uploaded by
 * users (or recorded from live streams or stories) before the
 * yt-transcode-worker's poster-extraction code path was wired up. They play
 * fine — they just paint a black frame on first render instead of a poster.
 *
 * What this does, per reel (idempotent — re-running matches 0 rows):
 *   1. ffmpeg streams the source URL with `-ss 1 -vframes 1` to grab one
 *      frame at t=1s, scaled to 480 wide, q:v=2 (high quality jpeg).
 *   2. Uploads the jpg to the social-media bucket at
 *      reels/thumbs/native_backfill/{reel_id}.jpg
 *   3. UPDATEs social_reels.thumbnail_url with the bucket public URL.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-native-poster-thumbnails.mjs
 *
 * This script is safe to re-run: WHERE clauses target NULL thumbs only.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = 'social-media';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function runFfmpeg(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const t = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.split('\n').slice(-5).join(' | ')}`));
    });
    proc.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

async function extractAndUpload(reel) {
  const tmpJpg = path.join(tmpdir(), `poster_${reel.id}.jpg`);
  // -ss BEFORE -i = seek by container timestamp (fast, but inaccurate on some
  //   sources). For posters we don't care about millisecond accuracy.
  // -t 3 caps how much input we read so a long reel doesn't tie us up.
  // -an drops audio, -vframes 1 takes one frame, scale=480:-1 keeps aspect.
  // -q:v 2 = high JPEG quality (1 best, 31 worst).
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', '1',
    '-i', reel.video_url,
    '-t', '3',
    '-vframes', '1',
    '-an',
    '-vf', 'scale=480:-1',
    '-q:v', '2',
    tmpJpg,
  ], 45_000);

  const buf = await readFile(tmpJpg);
  const objectPath = `reels/thumbs/native_backfill/${reel.id}.jpg`;
  const { error: upErr } = await supa.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, buf, {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '604800', // 7 days — these are static
    });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  const { data: pub } = supa.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  const { error: updErr } = await supa
    .from('social_reels')
    .update({ thumbnail_url: publicUrl })
    .eq('id', reel.id);
  if (updErr) throw new Error(`db update: ${updErr.message}`);

  await unlink(tmpJpg).catch(() => {});
  return publicUrl;
}

async function main() {
  console.log('[poster-backfill] starting…');

  // Skip the bogus example.com test reel — handled by separate SQL.
  const { data: reels, error } = await supa
    .from('social_reels')
    .select('id,video_url,source_type,created_at')
    .eq('media_status', 'ready')
    .is('thumbnail_url', null)
    .not('video_url', 'ilike', '%youtube%')
    .not('video_url', 'ilike', '%example.com%');

  if (error) throw error;

  console.log(`[poster-backfill] candidates: ${reels.length}`);

  let ok = 0, fail = 0;
  for (const reel of reels) {
    try {
      const url = await extractAndUpload(reel);
      console.log(`  ✓ ${reel.id} → ${url}`);
      ok += 1;
    } catch (err) {
      console.warn(`  ✗ ${reel.id} (${reel.source_type}) — ${err.message}`);
      fail += 1;
    }
  }

  console.log(`[poster-backfill] done — ${ok} succeeded, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[poster-backfill] FATAL:', err);
  process.exit(2);
});
