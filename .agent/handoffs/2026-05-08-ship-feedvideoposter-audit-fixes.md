# Handoff: ship FeedVideoPoster 4-pass audit fixes (B1-B6)

**Date:** 2026-05-08 (early)
**From:** Cowork Claude (sandbox can't delete `.git/index.lock`)
**For:** Antigravity or Dan's Terminal session
**Scope:** ONE file change — `src/components/social/SharedVideoComponents.jsx` (the `FeedVideoPoster` component only)

## Context

Dan ran a 4-pass max-rigor audit on `FeedVideoPoster`. Six bugs found and fixed in five rounds (any pass finding a new issue restarted from Pass 1; convergence after Round 5 produced 4 consecutive clean passes).

| # | Bug | Severity | Fix |
|---|---|---|---|
| B1 | `useEffect` deps for IntersectionObserver excluded `imgFailed` — when img errored and Branch 2 mounted, observer never attached → no autoplay → iOS Safari black tile (the original symptom recreated) | HIGH | Added `imgFailed` to deps |
| B2 | `<video poster={thumbnailUrl}>` reused the same broken URL after img errored — fetched and failed again | MEDIUM | `poster={imgFailed ? undefined : thumbnailUrl}` |
| B3 | `imgFailed` state never reset when `thumbnailUrl` prop changed (e.g., transcode worker backfills via realtime) — component permanently stuck in Branch 2 | MEDIUM | Added `useEffect(() => setImgFailed(false), [thumbnailUrl])` |
| B4 | 2-up call site bypasses `VideoPostWrapper`'s YouTube guard — YT URLs got stuffed into `<video src>` | LOW | Added `isYouTube` early-return inside `FeedVideoPoster` rendering YT thumbnail `<img>` |
| B5 | When BOTH thumbnail and video fail, broken `<video>` + parent's play overlay = "black tile + play button" (the original symptom) | LOW | Added `videoFailed` state + `<video onError>` handler + gradient placeholder branch |
| B6 | IntersectionObserver leaked when `videoFailed` flipped to gradient — observer still attached to unmounted `<video>` element | LOW | Added `videoFailed` to observer effect's deps |

Final component has 2 state hooks (`imgFailed`, `videoFailed`), 1 ref (`videoRef`), 3 `useEffect`s, and 4 render branches (YT short-circuit → videoFailed gradient → Branch 1 img → Branch 2 video).

## What needs shipping

ONE file modified:
```
M src/components/social/SharedVideoComponents.jsx
```

The only function touched is the `FeedVideoPoster` named export (lines ~231-322). All other exports in the file (`VideoThumbnail`, `VideoPostWrapper`, `FullScreenVideoViewer`) are unchanged. The two consumer files (`pages/hub/social-pages/[pageId].js`, `pages/hub/social-media/index.js`) need no changes — `FeedVideoPoster`'s prop signature is unchanged.

## Steps

The working tree currently has unrelated WIP from other agents:
```
M data/charity_source_registry.json
M pages/hub/reels.js
M src/components/social/Reels.jsx
M src/components/social/ReelsFeedCarousel.jsx
M src/components/social/SharedVideoComponents.jsx   ← MINE
M src/stores/trainingStore.js
?? .agent/audits/2026-05-07-phase-105-game-click-breakage.md
```

Park everything except mine via stash, push, restore:

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# 1. Clear the stale lock (sandbox couldn't; Mac user can).
rm -f .git/index.lock

# 2. Stage ONLY my one file.
git add src/components/social/SharedVideoComponents.jsx

# 3. Park other agents' WIP so git-safe-push.sh's `git add -A` doesn't bundle them in.
git stash push --keep-index -u -m "park-other-agents-wip-while-shipping-FeedVideoPoster-audit"

# 4. Verify only my file remains.
git status --short    # expect: only `M  src/components/social/SharedVideoComponents.jsx` (staged)

# 5. Push via the canonical script.
bash scripts/git-safe-push.sh "fix(feed-video-poster): 4-pass audit — 6 bugs (B1-B6: observer deps, poster reuse, state reset, YT guard, gradient fallback, observer leak)"

# Wait for: DEPLOY_VERIFIED:true and SHA_MATCHED:true.

# 6. Restore the parked WIP.
git stash pop
```

## Verification on smarter.poker

After production /api/health serves the new SHA, on iPhone:

1. Hard-refresh `/hub/social-media`.
2. Scroll the feed. Every video post should show either:
   - The thumbnail image (most cases), OR
   - The first frame via autoplay-on-scroll (live replays + cases without thumbnail), OR
   - A gradient placeholder (the new fallback for double-failure cases — should be rare).
3. **No post should render as a pure black tile with just a play button.** That's the symptom this entire audit eliminated.

The 749 transcode jobs Hetzner is processing today will start backfilling thumbnails. As they land, B3's reset-on-prop-change will let those posts auto-upgrade from Branch 2 (autoplay video) to Branch 1 (cached thumbnail img) the next time the realtime subscription pushes the UPDATE.

## Success criteria

- ✅ `git-safe-push.sh` exits 0 with `DEPLOY_VERIFIED:true`.
- ✅ `git stash pop` restores other agents' WIP cleanly.
- ✅ Production `/api/health` serves a new SHA containing the FeedVideoPoster fixes.
- ✅ Manual iPhone test confirms no "black + play button" tiles.
