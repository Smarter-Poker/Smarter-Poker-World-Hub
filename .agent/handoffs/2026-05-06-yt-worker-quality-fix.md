# Handoff: Ship the YouTube-worker quality fix

**Created:** 2026-05-06
**Author:** Cowork (sandboxed — couldn't release stale `.git/index.lock`)
**Receiver:** Antigravity (or any agent running on Dan's mac with full git access)
**Scope:** Push 3 already-edited files, redeploy worker, optionally re-encode existing low-quality MP4s.
**Time estimate:** 5–10 min for the push; ~30 min if you also kick off a re-encode pass.

---

## Why this exists

The YouTube → native MP4 worker was producing visibly low-quality output: ~1 Mbps total bitrate for 1080p vertical content. Confirmed via ffprobe on a sample in storage:

```
codec=h264  profile=Main  608x1080  30fps
bit_rate=1.05 Mbps   (vs YouTube source 3-5 Mbps, TikTok/IG baseline 4-6 Mbps)
```

Cause: `ffmpeg -preset fast -crf 23 -profile:v main -level 4.0` was a full lossy re-encode applied on top of YouTube's already-compressed source. Double-lossy and aggressively under-spec'd.

## What's already done (file edits ARE on disk in the repo)

Three files are modified in the working tree but **not yet committed**:

1. `scripts/yt-transcode-worker/index.js`
   - Format selector prefers H.264 (avc1) + AAC in MP4 → stream-copyable.
   - Tries `ffmpeg -c copy -movflags +faststart` first (lossless remux, <1s, preserves YouTube's full source bitrate).
   - Fallback to re-encode at `preset=slow crf=18 profile=high level=4.1 / 192k AAC` only when stream-copy fails (VP9/AV1 sources).
   - Thumbnails extracted from `rawFile` (yt-dlp's pristine source) at native resolution with `-q:v 2`, not the re-encoded `outFile`.

2. `src/components/social/Reels.jsx` (line 1696)
   - YouTube error-overlay thumbnail upgraded from `hqdefault.jpg` (480×360) to `maxresdefault.jpg` (1280×720).

3. `src/components/social/ReelsFeedCarousel.jsx` (line 1663)
   - Same `hqdefault → maxresdefault` upgrade for the error-overlay path.

Verified: `node --check scripts/yt-transcode-worker/index.js` exits 0.

## Working-tree state to be aware of

There are several **other files** modified in the working tree from prior sessions that are NOT part of this fix:

```
M src/components/memory/MemoryCampaignView.tsx
M src/components/training/FeedbackCard.tsx
M src/components/training/JarvisDashboard.tsx
M src/components/training/TrainingAchievements.tsx
M src/components/training/TrainingLeaderboard.tsx
M src/components/training/TrainingStreak.tsx
M src/hooks/useTrainingAccountant.ts
M src/lib/liveHelp/contextCollector.ts
M src/world/components/Jarvis/TrainingProgressTracker.tsx
M tsconfig.tsbuildinfo
```

Do NOT include those in this commit — they belong to whatever session left them. Stash them, then push only the 3 quality-fix files.

There's also a stale `.git/index.lock` blocking everything. Remove it first.

---

## Execution

Run from a normal terminal on Dan's mac (NOT the sandbox):

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# 1. Clear stale lock
rm -f .git/index.lock

# 2. Stash unrelated working-tree changes
git stash push -m "prior-session-2026-05-06-unrelated" -- \
  src/components/memory/MemoryCampaignView.tsx \
  src/components/training/FeedbackCard.tsx \
  src/components/training/JarvisDashboard.tsx \
  src/components/training/TrainingAchievements.tsx \
  src/components/training/TrainingLeaderboard.tsx \
  src/components/training/TrainingStreak.tsx \
  src/hooks/useTrainingAccountant.ts \
  src/lib/liveHelp/contextCollector.ts \
  src/world/components/Jarvis/TrainingProgressTracker.tsx \
  tsconfig.tsbuildinfo

# 3. Verify only the 3 quality-fix files remain
git status --short
# Expected:
#  M scripts/yt-transcode-worker/index.js
#  M src/components/social/Reels.jsx
#  M src/components/social/ReelsFeedCarousel.jsx

# 4. Push via the canonical safe-push script
bash scripts/git-safe-push.sh "fix(yt-worker): stop double-encoding — stream-copy first, HQ re-encode fallback

Quality root cause: ffmpeg re-encode at preset=fast/crf=23/profile=main was
producing ~1 Mbps output for 1080p vertical content (vs YouTube source 3-5 Mbps,
TikTok/IG baseline 4-6 Mbps). All converted reels were visibly low-res.

Fixes:
- yt-dlp format selector now prefers avc1+aac in mp4 (stream-copyable)
- Try lossless stream-copy first (-c copy + faststart, <1s, 0 quality loss)
- Fallback re-encode bumped to preset=slow / crf=18 / profile=high / level=4.1
  / 192k AAC — only used when source is VP9/AV1
- Thumbnails extracted from raw yt-dlp file at native res (q:v 2) instead of
  the re-encoded outFile
- Player error overlays use maxresdefault.jpg (1280x720) instead of
  hqdefault.jpg (480x360)"
```

The script handles everything: build gate, push retries, post-deploy verification. Wait for `DEPLOY_VERIFIED:true` + `SHA_MATCHED:true`.

The worker code under `scripts/yt-transcode-worker/` is auto-deployed to Hetzner by `.github/workflows/deploy-yt-worker.yml` (triggers on push to that path), so the worker on the box will pick up the new code within ~2-3 minutes of CI completing.

---

## Verification

After deploy completes:

1. **Worker restarted with new code:**
   ```bash
   ssh openclaw@$HETZNER_HOST "sudo systemctl status sp-yt-transcode --no-pager | head -10"
   ```
   `Active: active (running)` and a recent start time.

2. **Watch the next conversion log line:**
   ```bash
   ssh openclaw@$HETZNER_HOST "sudo journalctl -u sp-yt-transcode -n 50 --no-pager | grep -E 'Remuxed|Re-encoded'"
   ```
   New conversions should log `Remuxed (lossless) → X.X MB` for the common case (avc1 source). Fallback path logs `Re-encoded (HQ) → X.X MB` only for VP9/AV1 sources.

3. **Probe a fresh conversion's bitrate:**
   ```sql
   -- After at least one new conversion lands
   SELECT video_url FROM social_reels
   WHERE media_status='ready' AND video_url ILIKE '%supabase.co/storage%'
   ORDER BY updated_at DESC LIMIT 1;
   ```
   Then:
   ```bash
   curl -s --range 0-2097151 "<url>" -o /tmp/sample.mp4
   ffprobe -v error -select_streams v:0 \
     -show_entries stream=codec_name,profile,width,height,bit_rate \
     -show_entries format=duration,bit_rate -of default=nw=1 /tmp/sample.mp4
   ```
   **Expect:** bit_rate ≥ 3,000,000 (3 Mbps) — that's the quality target. Anything ≥ 2 Mbps is acceptable improvement; 1 Mbps means the fix didn't take.

---

## Optional: re-encode the existing 2,370 low-quality MP4s

The fix only applies to NEW conversions. The 2,370 reels already in storage are stuck at ~1 Mbps until re-converted. If Dan wants them re-done at HQ:

```sql
-- 1. Re-queue all currently-native reels for reconversion. The trigger will
--    create new video_transcode_jobs rows for each unique original_youtube_url.
UPDATE social_reels
SET media_status = 'queued'
WHERE media_status = 'ready'
  AND video_url ILIKE '%supabase.co/storage%';

-- 2. The trigger does the queueing. Verify:
SELECT status, COUNT(*) FROM video_transcode_jobs WHERE created_at > now() - interval '5 minutes' GROUP BY status;
```

This will queue ~700-800 distinct URLs (after dedup via the broadcast logic). Worker drain at 3 concurrent: ~30-60 min.

**Caveats before doing this:**
- Old MP4s are NOT deleted automatically. They'll be orphaned in storage until garbage-collected.
- If cookies are still failing on Hetzner, the re-queued jobs will fail too. Don't trigger this until cookies are working (separate handoff: `2026-05-04-yt-cookie-refresh-and-requeue.md`).

---

## Update task tracker on completion

After verification passes:
```bash
# Update .agent/audits/ with what was found + fixed
mkdir -p .agent/audits
cat > .agent/audits/2026-05-06-yt-worker-quality-fix.md <<'EOF'
# Audit: low-quality YouTube reels output (2026-05-06)

## Found
2,370 reels in storage at ~1 Mbps for 1080p vertical (vs 3-5 Mbps source).
Cause: ffmpeg re-encode at preset=fast/crf=23/profile=main.

## Fixed
- Worker now tries `-c copy` first (lossless), falls back to `preset=slow crf=18`.
- Thumbnails pulled from rawFile, not re-encode.
- Player error overlays bumped to maxresdefault.

## Verification
- Sample bitrate after fix: <fill in>
- Worker log shows `Remuxed (lossless)` on common path.

## Deferred
Re-conversion of existing 2,370 low-quality MP4s — gated on cookie health.
EOF
```
