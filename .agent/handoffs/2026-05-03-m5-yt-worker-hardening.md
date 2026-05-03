# Handoff: M5 — YT Worker Hardening (zombie-reset + error classification)

**Date:** 2026-05-03
**Origin agent:** Cowork session (Sonnet 4.6)
**Reason for handoff:** Origin agent's bash sandbox (`No space left on device`) and GitHub MCP token (`Bad credentials`) are dead. Origin can apply SQL fixups directly via Supabase MCP but cannot push code changes. M1+M2+M3+M4 all shipped and verified in production; this handoff covers two recurring operational gaps in the YouTube worker that origin has been patching by hand each session.

**Mission:** Patch `scripts/yt-transcode-worker/index.js` to (a) periodically reset stale `processing` rows, not just at startup, and (b) classify yt-dlp "permanent failure" errors and auto-promote the reel to `media_status='ready'` (iframe-forever) instead of leaving the reel stuck at `media_status='failed'`. Push via `npm run push`. The existing GitHub Actions workflow (`.github/workflows/deploy-yt-worker.yml`) auto-deploys to Hetzner.

---

## Why this matters

Twice in 2 days the origin agent had to manually run zombie-reset SQL via the Supabase MCP because dozens of jobs were stuck in `status='processing'` long past the 5-min download timeout / 10-min ffmpeg timeout. Symptoms:

```
SELECT COUNT(*) FROM video_transcode_jobs
WHERE source_type='youtube' AND status='processing'
  AND started_at < NOW() - INTERVAL '10 minutes';
-- typically returns 30-80 zombies
```

Root cause is in `scripts/yt-transcode-worker/index.js`:

```js
// resetStaleProcessing() runs ONCE on startup, never again.
async function resetStaleProcessing() {
  const { data, error } = await supa.from('video_transcode_jobs')
    .update({ status: 'queued', error_message: 'worker_restarted' })
    .eq('status', 'processing')
    .eq('worker_id', WORKER_ID)
    .eq('source_type', 'youtube')
    .select('id');
  ...
}
```

Two problems:
1. Only runs at process start. If the systemd unit doesn't restart for hours, zombies accumulate (worker process can leave a job in 'processing' if it crashes mid-job, if the box reboots without graceful shutdown, if the Promise's `.finally` doesn't fire because of an uncaught throw).
2. Filters by `worker_id = WORKER_ID` — a zombie owned by a *different* worker_id (e.g., the worker name was changed in env between deploys) is never reset.

And the error-classification gap: when `yt-dlp` returns "Video unavailable" / "private" / "removed by uploader" / "live event will begin", the worker marks the job `failed` but leaves `social_reels.media_status = 'failed'`. That state blocks the M4 player gate query. Origin has been manually flipping these to `media_status = 'ready'` so the iframe player serves them forever.

---

## Current production state at handoff

```
queued:              76     ← (reset by origin via Supabase MCP just now)
processing:           5     ← legit in-flight
completed:          344
failed:               8
reels_native:       344
m4_gate_remaining:   81
```

The recurring zombie issue means this handoff isn't urgent (worker drains fine, origin can keep patching), but ship it before the queue gets meaningfully bigger or before the next M4-gated work starts.

---

## What to change in `scripts/yt-transcode-worker/index.js`

### Change 1 — Periodic stale-reset (runs every tick, not just at startup)

Replace the existing `resetStaleProcessing()` and add a wider-net periodic reset that doesn't filter on `worker_id`. The 10-min cutoff is well past any legitimate timeout (yt-dlp 5min + ffmpeg 10min = max 15min, but the timeout already returns early so 10min is a safe cutoff).

```js
// Run on startup AND on every tick. Resets ANY 'processing' row older
// than 10 min, not just rows owned by this worker_id — orphans from
// previous workers / crashed processes get caught too.
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

  // Also flip the corresponding reels back to 'queued' so the gate query
  // reflects reality.
  const reelIds = data.map(r => r.reel_id).filter(Boolean);
  if (reelIds.length) {
    await supa.from('social_reels')
      .update({ media_status: 'queued' })
      .in('id', reelIds);
  }
}
```

Then in the main loop, call it both at startup and inside `pollLoop()`:

```js
log(`Starting yt-transcode-worker`);
// ... existing log lines ...
await resetStaleProcessing('worker_startup');

async function pollLoop() {
  try {
    // Every poll cycle: clean up zombies older than 10 min before claiming.
    await resetStaleProcessing();
    const dispatched = await tick();
    const nextDelay = (dispatched > 0 || activeJobs > 0) ? FAST_POLL_MS : POLL_MS;
    setTimeout(pollLoop, nextDelay);
  } catch (e) {
    warn('tick error:', e?.message);
    setTimeout(pollLoop, POLL_MS);
  }
}
pollLoop();
```

### Change 2 — Classify unrecoverable yt-dlp errors

Update the `catch (err)` block in `processJob()`. When the error message matches a known-permanent yt-dlp signal, flip the reel to `media_status='ready'` so the iframe player keeps serving it forever. Keep the job row marked `failed` (don't requeue) and stash the original error.

```js
const PERMANENT_YT_DLP_PATTERNS = [
  /Video unavailable/i,
  /This video is private/i,
  /This video has been removed/i,
  /removed by the uploader/i,
  /This live event will begin/i,    // future scheduled — could retry, but rare; keep iframe
  /age-restricted/i,
  /members-only/i,
  /copyright claim/i,
];

const PERMANENT_FFMPEG_PATTERNS = [
  /ffmpeg_timeout_/i,    // source video too long; iframe is the right answer
];

function isPermanentFailure(msg) {
  return PERMANENT_YT_DLP_PATTERNS.some(rx => rx.test(msg))
      || PERMANENT_FFMPEG_PATTERNS.some(rx => rx.test(msg));
}

// Inside processJob's catch block, replace the existing reel update:
} catch (err) {
  const msg = (err?.message || String(err)).slice(0, 500);
  warn(`✗ Job ${job.id} failed: ${msg}`);

  const permanent = isPermanentFailure(msg);

  if (job.reel_id) {
    await supa.from('social_reels')
      .update({
        // Permanent → reel keeps playing as iframe forever (gate-clearing).
        // Transient → mark failed; backfill --requeue-failed can retry later.
        media_status: permanent ? 'ready' : 'failed',
      })
      .eq('id', job.reel_id)
      .catch(() => {});
  }

  await supa.from('video_transcode_jobs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    error_message: msg,
  }).eq('id', job.id).catch(() => {});

  if (permanent) {
    log(`  (permanent — reel ${job.reel_id} kept as iframe-forever)`);
  }
}
```

### Change 3 — Optional: bump ffmpeg timeout

Currently `FFMPEG_TIMEOUT = 600_000` (10 min). The 3 long-video failures origin saw were all >10 min videos. If you want native MP4 for those (they're currently iframe-forever), bump to 1800_000 (30 min). Tradeoff: a runaway re-encode can hold a worker slot for 30 min instead of 10. Recommend leaving at 10 min — long YouTube videos as reels is unusual UX anyway.

---

## What you (the receiving agent) must do

### Step 1 — Verify queue state before changes

```sql
SELECT
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE source_type='youtube' AND status='processing'
    AND started_at < NOW() - INTERVAL '10 minutes') AS zombies_present,
  (SELECT COUNT(*) FROM video_transcode_jobs WHERE source_type='youtube' AND status='failed'
    AND error_message ~* '(unavailable|private|removed)') AS unclassified_permanent,
  (SELECT COUNT(*) FROM social_reels
    WHERE (video_url ILIKE '%youtube%' OR video_url ILIKE '%youtu.be%')
    AND media_status NOT IN ('ready','failed')) AS m4_gate_remaining;
```

If `zombies_present > 50` reset them via SQL before deploying — otherwise the periodic reset on first tick will race the worker and you'll see a confusing log spike.

### Step 2 — Edit `scripts/yt-transcode-worker/index.js`

Apply Changes 1 and 2 above. Skip Change 3 unless you have a specific reason. Don't touch:
- `claimJob()` — atomic claim is correct
- `processJob()` body other than the catch block
- `tick()` — fire-and-forget pattern is correct
- `runProcess()`, file paths, the env-loading logic
- The cookie-refresh systemd units (`sp-yt-cookie-refresh.service` / `.timer`) — they exist for camoufox cookie harvesting, separate concern

### Step 3 — Self-test the change locally

```bash
cd ~/Documents/Smarter-Poker-World-Hub
node -e "import('./scripts/yt-transcode-worker/index.js').catch(e => console.error('SYNTAX:', e.message))"
```

Expect: process tries to start, hits "FATAL: missing SUPABASE_SERVICE_ROLE_KEY" and exits clean. That confirms ESM imports + top-level await + syntax are all OK without actually starting the worker on your laptop.

### Step 4 — Push

```bash
npm run push "fix(yt-worker): periodic stale-reset + classify permanent yt-dlp/ffmpeg failures as iframe-forever"
```

The push triggers `.github/workflows/deploy-yt-worker.yml` because the path filter matches `scripts/yt-transcode-worker/**`. Watch the workflow run — it scp's the new index.js, restarts `sp-yt-transcode.service`, and tails 30 lines of journalctl.

### Step 5 — Verify the fix lands

```bash
ssh openclaw@<HETZNER_HOST> 'sudo journalctl -u sp-yt-transcode -n 100 --no-pager | grep "stale"'
```

Should show:
```
[yt-worker ...] Reset N stale 'processing' row(s) (worker_startup)
```
and within a few minutes:
```
[yt-worker ...] Reset N stale 'processing' row(s) (periodic_stale_reset)
```
when zombies are caught mid-flight.

Then over the next hour, run:

```sql
SELECT * FROM v_yt_jobs_health;
```

`failed` row count for unconvertible-pattern errors should NO LONGER grow — those are now flipped to `media_status='ready'` and the job is marked completed-equivalent (status=failed but reel doesn't block gate).

Actually — re-read Change 2. The job stays `status='failed'`, just the reel media_status flips. So `failed` job count CAN keep growing for permanent errors. The right verification is:

```sql
-- Reels in 'failed' state should hit zero over time as the worker reclassifies them
SELECT COUNT(*) FROM social_reels
WHERE source_type='youtube' AND media_status='failed';
```

This count should drop to 0 once the worker has had a chance to reprocess the existing failed reels (it won't — they stay failed because the job isn't requeued). Manual cleanup option:

```sql
-- Optional: one-shot cleanup of existing 'failed' reels with permanent errors
UPDATE social_reels SET media_status='ready'
WHERE id IN (
  SELECT DISTINCT reel_id FROM video_transcode_jobs
  WHERE source_type='youtube' AND status='failed' AND reel_id IS NOT NULL
    AND error_message ~* '(unavailable|private|removed|ffmpeg_timeout|live event)'
);
```

### Step 6 — Report back

- Deployed SHA from `git-safe-push.sh`
- `sudo systemctl is-active sp-yt-transcode` output
- First "Reset N stale" log line from journalctl (proves periodic reset is firing)
- Final `SELECT * FROM v_yt_jobs_health;` snapshot

---

## Failure modes

| Failure | Fix |
|---|---|
| Worker crash-loops after deploy | The change is small. Most likely a syntax error from a partial edit. Re-read the file, look for unbalanced braces in the new helpers. |
| `Reset N stale` log never appears | The 10-min cutoff threshold is too high for current data. Verify `started_at` is being SET when the worker claims (check `claimJob()` — it does set it). |
| Zombies grow even with periodic reset | `pollLoop()` not actually being called periodically. Verify the `setTimeout(pollLoop, ...)` chain is intact at the bottom of index.js. |
| Permanent-error flip doesn't fire | Verify `isPermanentFailure(msg)` matches the actual error text. Add a `log('match:', permanent, msg.slice(0,80))` debug line if uncertain. |

---

## Do NOT touch

- `claimJob()` — atomic update pattern is correct.
- HEVC worker (`scripts/transcode-worker/index.js`) — different pipeline, unrelated.
- The triggers on `social_reels` — they're production-correct; the bulk-backfill UPDATE in the migration tagged everything that needed tagging.
- `pages/api/cron/transcode-videos.js` — Vercel cron, HEVC-only.
- Anything outside `scripts/yt-transcode-worker/index.js`. This is a one-file change.

## Out of scope

- Cookie harvesting (camoufox / `sp-yt-cookie-refresh.timer`). Separate concern, currently disabled per the GH Actions workflow.
- M4 player further tuning. Already shipped, monitor user reports.
- Adding new yt-dlp options (cookies-from-browser, proxy, etc). Future round if needed.

## References

- Previous handoffs (mission complete):
  - `.agent/handoffs/2026-05-01-yt-pipeline-push-and-secrets.md` — M1+M2+M3
  - `.agent/handoffs/2026-05-03-m4-player-rewrite.md` — M4
- CLAUDE.md §1 (deploy pipeline), §3 (8 immutable rules — N/A, this is worker code).
