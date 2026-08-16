# Handoff: M7 — Worker post-sync + loadReels simplification + capacity bump

**Date:** 2026-05-03
**Origin agent:** Cowork session (Sonnet 4.6)
**Reason for handoff:** Origin's bash sandbox + GitHub MCP are dead — code can't be pushed from this session. Origin applied the SQL part directly via Supabase MCP (10,271 reel mirrors backfilled, mirror trigger on social_posts installed). Receiving agent does the three remaining code/config changes.

**Mission:** Close the loop on Operation TikTok Reels by (1) making the worker rewrite `social_posts.media_urls[0]` when it finishes a YouTube conversion, (2) simplifying `Reels.jsx loadReels` now that every public video post has a reel mirror, and (3) bumping worker concurrency from 3 to 6 to halve the 85-hour drain time. Push via `npm run push`; the existing `.github/workflows/deploy-yt-worker.yml` auto-deploys to Hetzner.

---

## Why this is needed

The Reels feed has **two parallel render sources**:
- `social_reels` (now 10,914 rows, 10,360 of them YouTube, 10,352 queued for conversion)
- `social_posts` directly (limit 20 per `loadReels` call) — pulled by the `postsResult` Promise in `Reels.jsx`

When the worker converts a reel:
- `social_reels.video_url` → Supabase native URL ✓
- `social_posts.media_urls[0]` → STILL the YouTube URL ✗

The dedup logic in `loadReels` keys on `video_url`. Once those diverge for the same content, **both render**: one as a native `<video>` (fast) and one as a YouTube iframe (slow). User sees duplicates with mixed performance.

Two fixes close the gap:
1. Worker code change: also update `social_posts.media_urls[0]` (matches the HEVC worker's pattern at `scripts/transcode-worker/index.js` line 136-138).
2. `loadReels` cleanup: stop querying `social_posts` for video content because every video post now has a reel mirror.

Plus capacity: 10,289 jobs at 3-way concurrency = ~85 hours. Bumping to 6 halves it to ~43 hours.

## Current production state (verified at handoff)

```
reels_total:                10914
reels_youtube:              10360
reels_youtube_queued:       10352   ← waiting for worker
reels_youtube_ready_iframe:     8   ← unconvertible (private/removed/timeout)
reels_native:                 344   ← already converted
jobs_queued:                10289
jobs_processing:               63
jobs_completed:               344
jobs_failed:                    8
posts_still_unmirrored:         0
```

The trigger on `social_posts` is live. Any future video post auto-mirrors to `social_reels`, which auto-queues a conversion job. The pipeline self-maintains.

---

## Change 1 — Worker post-sync

`scripts/yt-transcode-worker/index.js` — inside `processJob()`, after the existing `social_reels` update at the success path, add a parallel update for `social_posts`:

```js
// Existing code (DO NOT REMOVE):
if (job.reel_id) {
  const { error: reelErr } = await supa.from('social_reels').update({
    video_url: publicUrl,
    source_type: 'native',
    media_status: 'ready',
  }).eq('id', job.reel_id);
  if (reelErr) warn(`  reel update warn (job ${job.id}):`, reelErr.message);
}

// NEW — also update the source post's media_urls so the main social feed
// (and any other reader) shows the native URL. Mirror the HEVC worker pattern.
if (job.reel_id) {
  // Look up the source post via the reel's source_post_id
  const { data: reelRow } = await supa.from('social_reels')
    .select('source_post_id, thumbnail_url')
    .eq('id', job.reel_id)
    .maybeSingle();

  if (reelRow?.source_post_id) {
    // Read existing media_urls and replace [0]; preserve any additional entries.
    const { data: postRow } = await supa.from('social_posts')
      .select('media_urls, thumbnail_url, original_media_url')
      .eq('id', reelRow.source_post_id)
      .maybeSingle();

    if (postRow) {
      const existingArr = Array.isArray(postRow.media_urls) ? postRow.media_urls : [];
      const newMediaUrls = [publicUrl, ...existingArr.slice(1)];
      const updatePayload = {
        media_urls: newMediaUrls,
        original_media_url: postRow.original_media_url || existingArr[0] || null,
      };
      // Only set thumbnail if the post doesn't already have one — don't clobber a
      // user-picked cover. Reel thumbnails are auto-generated, so a real one wins.
      if (!postRow.thumbnail_url && reelRow.thumbnail_url) {
        updatePayload.thumbnail_url = reelRow.thumbnail_url;
      }
      const { error: postErr } = await supa.from('social_posts')
        .update(updatePayload)
        .eq('id', reelRow.source_post_id);
      if (postErr) warn(`  post update warn (job ${job.id}):`, postErr.message);
    }
  }
}
```

Notes:
- Don't touch `social_page_posts` here — the existing HEVC cron transcoder handles that for its own pipeline; YouTube content rarely flows there.
- Wrap the new block in the same try/catch surrounding `processJob()` body — failures here MUST NOT mark the whole job failed (the reel side already succeeded).

Actually safer pattern — refactor to a tolerant helper:

```js
async function syncPostFromReel(reelId, publicUrl) {
  try {
    const { data: reelRow } = await supa.from('social_reels')
      .select('source_post_id, thumbnail_url').eq('id', reelId).maybeSingle();
    if (!reelRow?.source_post_id) return;

    const { data: postRow } = await supa.from('social_posts')
      .select('media_urls, thumbnail_url, original_media_url')
      .eq('id', reelRow.source_post_id).maybeSingle();
    if (!postRow) return;

    const existingArr = Array.isArray(postRow.media_urls) ? postRow.media_urls : [];
    const updatePayload = {
      media_urls: [publicUrl, ...existingArr.slice(1)],
      original_media_url: postRow.original_media_url || existingArr[0] || null,
    };
    if (!postRow.thumbnail_url && reelRow.thumbnail_url) {
      updatePayload.thumbnail_url = reelRow.thumbnail_url;
    }
    await supa.from('social_posts').update(updatePayload).eq('id', reelRow.source_post_id);
  } catch (err) {
    warn(`  syncPostFromReel skipped (reel ${reelId}):`, err?.message);
  }
}

// Then in processJob() success path, right after the social_reels update:
if (job.reel_id) await syncPostFromReel(job.reel_id, publicUrl);
```

## Change 2 — `loadReels` simplification

`src/components/social/Reels.jsx` — `loadReels` callback at line 583 currently does a 3-way Promise.all with userResult, libraryResult, and `postsResult` from `social_posts`. The `postsResult` was the only path that surfaced horse-posted YouTube videos before mirrors existed. Now that every public video post has a `social_reels` mirror, the `postsResult` query is redundant and creates the dedup gotcha.

**Recommended:** drop `postsResult` and the `postsAsReels` mapping. Keep just the two `social_reels` queries:

```js
const [userResult, libraryResult] = await Promise.all([
  supabase.from('social_reels').select(REEL_SELECT)
    .eq('is_public', true).eq('source_type', 'user')
    .order('created_at', { ascending: false }).limit(60),
  supabase.from('social_reels').select(REEL_SELECT)
    .eq('is_public', true).eq('source_type', 'video_library')
    .order('created_at', { ascending: false }).limit(60),
]);

// Also fetch native+youtube horse-posted reels (mirrors created by trigger):
const horseResult = await supabase.from('social_reels').select(REEL_SELECT)
  .eq('is_public', true).in('source_type', ['youtube', 'native'])
  .not('source_post_id', 'is', null)
  .order('created_at', { ascending: false }).limit(60);

const userReels  = userResult.data    || [];
const libReels   = libraryResult.data || [];
const horseReels = horseResult.data   || [];

// Drop postsAsReels block entirely.
```

Then update the interleave loop to splice in horseReels every 10 reels (same way it spliced posts before). Same dedup + view setup downstream.

Apply the equivalent change in `loadMoreReels` around line 752 (it has the same 3-way pattern).

**Alternative (less code change):** keep `postsResult` but exclude posts that have a reel mirror:

```js
.from('social_posts')
.select(...)
.eq('visibility', 'public')
.not('media_urls', 'is', null)
// NEW: exclude posts that have been mirrored
.not('id', 'in', supabase.from('social_reels').select('source_post_id'))   // PostgREST in-subquery
.order(...)
.limit(20)
```

PostgREST might not support `not('id','in', sub-query)` cleanly via supabase-js — verify against current PostgREST version before relying on it. If it doesn't, a server-side RPC is cleaner. Recommend the first approach (drop `postsResult` outright).

## Change 3 — Capacity bump

The worker `.env` is written by the GH Actions workflow at `.github/workflows/deploy-yt-worker.yml` line 102:

```yaml
MAX_CONCURRENT_YT=3
```

Change to:

```yaml
MAX_CONCURRENT_YT=6
```

CX22 (2 vCPU, 4GB RAM) handles 6 concurrent ffmpeg jobs OK because most of the time is spent in network I/O (yt-dlp download) rather than CPU. If memory pressure shows up in `journalctl -u sp-yt-transcode | grep -i "killed"` after the bump, drop to 4. The systemd unit caps at MemoryMax=3G.

## Steps

1. Pull latest:
   ```bash
   cd ~/Documents/Smarter-Poker-World-Hub
   git pull --rebase
   ```

2. Read current state of the three files:
   - `scripts/yt-transcode-worker/index.js`
   - `src/components/social/Reels.jsx` (lines 580–800 cover loadReels + loadMoreReels)
   - `.github/workflows/deploy-yt-worker.yml` (line 102)

3. Apply Changes 1, 2, and 3.

4. Self-test:
   ```bash
   node -e "import('./scripts/yt-transcode-worker/index.js').catch(e => console.error('SYNTAX:', e.message))"
   npx next build
   ```
   Both must succeed. The Next build catches Reels.jsx regressions; the node import check catches worker syntax errors.

5. Push:
   ```bash
   npm run push "feat(reels): M7 — worker post-sync + loadReels simplification + 6-way concurrency"
   ```
   Wait for `DEPLOY_VERIFIED:true`. The workflow path filter matches both `scripts/yt-transcode-worker/**` and `.github/workflows/deploy-yt-worker.yml`, so it triggers automatically. The MAX_CONCURRENT_YT=6 lands when GH Actions writes the env file.

6. Verify post-sync working:
   ```sql
   -- After ~10 minutes, this count should be > 0 and growing
   SELECT COUNT(*) FROM social_posts sp
   JOIN social_reels sr ON sr.source_post_id = sp.id
   WHERE sr.source_type = 'native'
     AND (sp.media_urls->>0) ILIKE '%supabase.co%';
   ```

7. Verify capacity bump:
   ```bash
   ssh openclaw@<HETZNER_HOST> 'sudo cat /etc/sp-yt-transcode.env | grep MAX_CONCURRENT'
   # Should show: MAX_CONCURRENT_YT=6
   ssh openclaw@<HETZNER_HOST> 'sudo journalctl -u sp-yt-transcode -n 20 --no-pager | grep "Concurrency"'
   # Should show: Concurrency: 6
   ```

8. Monitor drain:
   ```sql
   -- Run every hour
   SELECT * FROM v_yt_jobs_health;
   SELECT COUNT(*) FROM video_transcode_jobs WHERE source_type='youtube' AND status='queued';
   ```
   Expected: ~240/hr at 6-way concurrency. ~10,289 / 240 = ~43 hours to drain.

9. Smoke test the player on production at https://smarter.poker/hub/social-media (375px mobile-emulation, test account `daniel@bekavactrading.com` / `<TEST_USER_PASSWORD — see .env.local, never commit>`):
   - Open Reels feed
   - Confirm NO duplicate content (same video appearing twice in different formats)
   - Confirm horse-posted videos still play (likely as iframe initially while queue drains, transitioning to native as worker completes)
   - Confirm M4 swipe latency on already-converted reels is instant

10. Report: deployed SHA, capacity confirmation, duplicate-content check result, post-sync row count growth, queue drain rate.

## Failure modes

| Symptom | Fix |
|---|---|
| Build gate fails on `Reels.jsx` | Likely: removed `postsResult` but left orphan refs (`postsAsReels`, `pIdx`, etc.) Re-read the loadReels function, clean up loose ends. |
| Worker crash-loops | Syntax error in syncPostFromReel — verify braces. Try the `node -e "import(...)"` test. |
| `MAX_CONCURRENT_YT=6` shows but worker still runs 3 | Worker has to RESTART after env file changes. The workflow does `systemctl restart sp-yt-transcode`. Verify journalctl shows the new "Concurrency: 6" log line. |
| Duplicate content still appears in feed | postsResult wasn't actually removed, OR loadMoreReels still has it. Check both. |
| `social_posts.media_urls` not updating | syncPostFromReel throwing silently. Add a `log('synced post', sourcePostId)` line and check journalctl. |
| Worker memory crashes at 6-way | Drop to 4, or upgrade to CX32 (4 vCPU/8GB) for ~€7/mo more. |

## Do NOT touch

- HEVC worker (`scripts/transcode-worker/index.js`) — different pipeline.
- `pages/api/cron/transcode-videos.js` — Vercel cron, HEVC-only.
- `pages/hub/social-media/index.js` line 5486 auto-save — still useful for client uploads where the post and reel are created together; the trigger is the safety net.
- The triggers on `social_reels` — production correct.
- The new trigger on `social_posts` (`trg_social_posts_video_to_reel_mirror`) — production correct.
- The 8 immutable rules from CLAUDE.md §3.

## Out of scope

- A future trigger on `social_posts.media_urls UPDATE` — the worker's syncPostFromReel call covers this; no need to trigger-ize it.
- Migrating the existing 200 `video_library` reels to native MP4 — they intentionally stay as iframes per the original brief.
- Bumping the Hetzner box to CX32 — only do this if 6-way concurrency thrashes memory.

## References

- Migration applied this session: `social_posts_video_to_reel_mirror` (Supabase MCP, 2026-05-03)
- Previous handoffs:
  - `.agent/handoffs/2026-05-01-yt-pipeline-push-and-secrets.md` — M1+M2+M3, complete
  - `.agent/handoffs/2026-05-03-m4-player-rewrite.md` — M4, complete
  - `.agent/handoffs/2026-05-03-m5-yt-worker-hardening.md` — M5, complete
- CLAUDE.md §1 (deploy pipeline), §3 (immutable rules)
