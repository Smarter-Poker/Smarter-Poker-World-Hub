# Handoff: ship FeedVideoPoster Round 2 (B7+B8 fixes)

**Date:** 2026-05-08
**From:** Cowork Claude (sandbox can't `rm .git/index.lock`)
**For:** Antigravity / Dan's Terminal

## What this ships

Round 2 of the 4-pass max-rigor audit on `FeedVideoPoster`. Two new bugs found and fixed:
- **B7** — YT branch chained `onError` infinite-broken-img loop (Pass 3 finding)
- **B8** — observer doesn't attach on `thumbnailUrl` populated→NULL transition (Pass 4 finding); reachable RIGHT NOW via the in-flight reencode migration

Full audit doc: `.agent/audits/2026-05-08-feed-video-poster-round2.md`

## Files in working tree to ship

```
?? .agent/audits/2026-05-08-feed-video-poster-round2.md
M  src/components/social/SharedVideoComponents.jsx
```

**Other-agent WIP also in tree** (not mine — must be parked, not bundled):
```
M pages/hub/social-media/index.js
M scripts/yt-transcode-worker/index.js
M src/hooks/useGTOTrainer.js
?? scratch/check_rls.sql
?? supabase/migrations/20260508134500_streaming_audit_add_live_bans_to_realtime_publication_reapply.sql
```

## Steps

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# 1. Clear the stale .git/index.lock (Mac user perm; sandbox can't).
rm -f .git/index.lock

# 2. Stage ONLY my two files.
git add src/components/social/SharedVideoComponents.jsx \
        .agent/audits/2026-05-08-feed-video-poster-round2.md

# 3. Park the other-agent WIP so git-safe-push.sh's `git add -A` doesn't bundle it.
git stash push --keep-index -u -m "park-other-agents-wip-while-shipping-feed-video-poster-round2"

# 4. Verify only my 2 files remain dirty + staged.
git status --short
git diff --cached --name-only

# 5. Push via canonical script.
bash scripts/git-safe-push.sh "fix(feed-video-poster): Round 2 audit — 2 bugs (B7 YT chained-onError loop, B8 observer-deps thumbnailUrl→NULL transition)"

# Wait for: DEPLOY_VERIFIED:true and SHA_MATCHED:true.

# 6. Restore the parked WIP.
git stash pop
```

## Verification on smarter.poker

After deploy lands, on iPhone Safari:
1. Open `/hub/social-media`. Scroll the feed.
2. Every video tile should show either: real thumbnail, first frame of video, or gradient placeholder. ZERO pure-black tiles.
3. The 749 in-flight reels (yesterday's reencode migration) will be transitioning thumbnail_url=NULL during this window — those are the test cases for B8.

## Success criteria

- ✅ `git-safe-push.sh` exits 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`.
- ✅ Production `/api/health` serves a new SHA containing the patch.
- ✅ `git stash pop` restores other-agent WIP cleanly.
- ✅ Manual iPhone test: zero black-tile-with-play-button cases observed across a full feed scroll.
