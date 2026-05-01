#!/usr/bin/env node
/**
 * BACKFILL: Queue every existing YouTube reel for native-MP4 conversion.
 *
 * Operation TikTok Reels — M3
 *
 * Why this script exists:
 *   The migration (20260501000000_add_media_pipeline.sql) tags every existing
 *   YouTube reel with source_type='youtube' but leaves media_status='ready'
 *   so the iframe player keeps working in the meantime. To actually convert
 *   them to native MP4 we need to insert a video_transcode_jobs row for
 *   each — the AFTER INSERT trigger only runs on NEW reels, not existing
 *   ones, so we do the same work here in bulk.
 *
 * Idempotent: re-running is safe. Reels that already have a queued or
 * processing job are skipped. Reels that previously failed get re-queued.
 *
 * How to run:
 *   node scripts/backfill-youtube-reels.js
 *   node scripts/backfill-youtube-reels.js --dry-run   # show counts only
 *   node scripts/backfill-youtube-reels.js --requeue-failed
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Monitoring while it runs (or after):
 *   SELECT * FROM v_yt_jobs_health;
 *   SELECT * FROM v_yt_pipeline_health;
 *
 * The Hetzner worker (sp-transcode.service) drains the queue at
 * MAX_CONCURRENT_YT (default 3) jobs in parallel, ~30–90 s per job depending
 * on source video length. Total runtime estimate is printed up front.
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// ─── CLI flags ───────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const REQUEUE_FAILED = process.argv.includes('--requeue-failed');

// ─── Env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
  console.error('       Make sure .env.local has both set, then re-run.');
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function extractYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isYouTubeUrl(url) {
  return !!url && (url.includes('youtube.com') || url.includes('youtu.be'));
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BACKFILL: YouTube reels → native MP4 conversion queue');
  console.log('═══════════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  MODE: --dry-run  (no DB writes)');
  if (REQUEUE_FAILED) console.log('  MODE: --requeue-failed  (will retry failed conversions)');
  console.log('');

  // 1. Fetch all reels with a YouTube URL. Page through to handle large
  //    tables — Supabase caps a single .select() at 1000 rows by default.
  console.log('Scanning social_reels for YouTube URLs...');
  let allReels = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supa
      .from('social_reels')
      .select('id, video_url, author_id, source_type, media_status')
      .or('video_url.like.%youtube.com%,video_url.like.%youtu.be%')
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error('Fetch error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allReels.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Found ${allReels.length} reels with YouTube URLs.\n`);

  if (allReels.length === 0) {
    console.log('Nothing to backfill. Exiting.');
    return;
  }

  // 2. Fetch existing job rows so we can skip already-queued / already-processing.
  //    REQUEUE_FAILED flag re-includes status='failed' rows.
  const reelIds = allReels.map(r => r.id);
  const skipStatuses = REQUEUE_FAILED
    ? ['queued', 'processing', 'completed']
    : ['queued', 'processing', 'completed', 'failed'];

  const existingJobs = new Set();
  for (let i = 0; i < reelIds.length; i += 200) {
    const slice = reelIds.slice(i, i + 200);
    const { data: jobs, error } = await supa
      .from('video_transcode_jobs')
      .select('reel_id')
      .in('reel_id', slice)
      .in('status', skipStatuses);
    if (error) {
      console.error('Job lookup error:', error.message);
      process.exit(1);
    }
    (jobs || []).forEach(j => existingJobs.add(j.reel_id));
  }

  const eligible = allReels.filter(r => !existingJobs.has(r.id) && extractYtId(r.video_url));
  const skipped = allReels.length - eligible.length;

  console.log(`  Already queued/processing/completed: ${existingJobs.size}`);
  console.log(`  Skipped (no parseable YT id):        ${allReels.length - existingJobs.size - eligible.length}`);
  console.log(`  Eligible for queueing:               ${eligible.length}\n`);

  // 3. Time + cost estimate.
  const concurrency = Number(process.env.MAX_CONCURRENT_YT) || 3;
  const avgMinutesPerJob = 1.5; // realistic average across short clips
  const estHours = (eligible.length * avgMinutesPerJob) / 60 / concurrency;
  const estCost = estHours * 0.006;
  console.log(`  Concurrency:           ${concurrency} jobs in parallel`);
  console.log(`  Avg job duration:      ~${avgMinutesPerJob} min`);
  console.log(`  Estimated runtime:     ~${estHours.toFixed(1)} hours on Hetzner CX22`);
  console.log(`  Estimated Hetzner $:   ~€${estCost.toFixed(3)} (worker is always-on anyway)\n`);

  if (DRY_RUN) {
    console.log('Dry-run complete. Re-run without --dry-run to actually queue.');
    return;
  }

  if (eligible.length === 0) {
    console.log('Nothing eligible. Exiting.');
    return;
  }

  // 4. Insert jobs + flip media_status to 'queued' in batches.
  console.log('Queueing jobs...');
  let queued = 0;
  let failed = 0;
  const BATCH = 50;

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);

    // 4a. Insert all jobs in this batch in one round-trip.
    const jobRows = batch.map(reel => ({
      reel_id: reel.id,
      user_id: reel.author_id,
      source_url: reel.video_url,
      youtube_url: reel.video_url,
      source_type: 'youtube',
      status: 'queued',
      target_format: 'h264_1080p',
      target_bitrate: 2_500_000,
    }));

    const { error: insertErr } = await supa
      .from('video_transcode_jobs')
      .insert(jobRows);

    if (insertErr) {
      console.warn(`  Batch ${i / BATCH + 1} insert failed: ${insertErr.message}`);
      failed += batch.length;
      continue;
    }

    // 4b. Flip media_status='queued' on the reels in this batch.
    const ids = batch.map(r => r.id);
    const updatePayload = {
      media_status: 'queued',
      source_type: 'youtube',
    };
    // Only set youtube_video_id / original_youtube_url if not already set.
    // Bulk update is fine because the migration already ran the same fill.
    const { error: upErr } = await supa
      .from('social_reels')
      .update(updatePayload)
      .in('id', ids);

    if (upErr) {
      console.warn(`  Batch ${i / BATCH + 1} reel update warn: ${upErr.message}`);
      // Job rows are still queued — worker will pick them up regardless.
    }

    queued += batch.length;
    process.stdout.write(`  Queued ${queued}/${eligible.length}\r`);
  }

  console.log(`\n\n✅ Done.`);
  console.log(`   Queued:  ${queued}`);
  if (failed) console.log(`   Failed:  ${failed}`);
  console.log('');
  console.log('Monitor progress with:');
  console.log('  SELECT * FROM v_yt_jobs_health;');
  console.log('  SELECT * FROM v_yt_pipeline_health;');
  console.log('');
  console.log('M4 player rewrite is BLOCKED until this query returns 0:');
  console.log('  SELECT COUNT(*) FROM social_reels');
  console.log("  WHERE (video_url LIKE '%youtube%' OR video_url LIKE '%youtu.be%')");
  console.log("  AND media_status != 'ready';");
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
