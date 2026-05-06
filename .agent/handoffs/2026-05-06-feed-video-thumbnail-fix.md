# Handoff: ship feed-video thumbnail fix

**Date:** 2026-05-06
**Author:** Cowork Claude (this session)
**Why this is a handoff, not a `please do this`:** the sandbox shell that
ran the edits cannot release the stale `.git/index.lock` (mount-layer
permissions deny `unlink` on existing files inside `.git/`). All other
work is done — the source fix is on disk and ready to commit.

## Summary

Dan's complaint: "JUST POSTED A 17 SECOND VIDEO AND STILL POSTING THE
BLACK SCREEN WITH PLAY BUTTON, EVEN WHEN I SELECTED A THUMBNAIL."

Earlier sessions had patched `src/components/social/SmarterPokerStyleCard.jsx`
to add a `#t=0.001` first-frame fallback in `FeedVideoPlayer`. That fix
was wasted effort — `pages/hub/social-media/index.js` does NOT import
`SmarterPokerStyleCard` at all. The page renders posts inline with bare
`<video src={url} preload="metadata">` tags that ignore both
`post.thumbnail_url` and the first-frame trick.

This handoff fixes the actual offending render sites in
`pages/hub/social-media/index.js`:

- **1-up grid** (line ~1011, single-video posts): wrap the
  `<VideoPostWrapper>` child to render `<img src={post.thumbnail_url}>`
  when a thumbnail is set, otherwise `<video>` with `#t=0.001`
  appended to the src so the media engine decodes the first frame as
  a poster.
- **2-up grid** (line ~1050, first item is video): same treatment.

Both edits are already applied to disk on `main`. Just need to
commit + push + verify.

## What's already on disk (uncommitted)

```
M pages/hub/social-media/index.js
M scripts/yt-transcode-worker/index.js   (unrelated, leftover from earlier session)
?? summary_pt4.md                         (junk in outputs — ignore)
```

The `yt-transcode-worker/index.js` change shifts the YouTube downloader
from "prefer avc1 H.264" to "best 1080p of any codec, then re-encode" —
it should ride along since it's also a quality fix.

## Steps to execute

```bash
cd ~/Documents/Smarter-Poker-World-Hub

# 1. Clear the stale lock (created by aborted sandbox git invocation
#    around 11:16 UTC 2026-05-06). Confirm no real git is running first.
ps aux | grep -E '[g]it' || echo "no git running"
rm -f .git/index.lock

# 2. Sanity check — make sure the diff really has the thumbnail fix
grep -n 'FEED-VIDEO-THUMBNAIL-FIX-2026-05-06' pages/hub/social-media/index.js
# Expected: 2 hits — line ~1015 (1-up branch) and line ~1078 (2-up branch)

# 3. Push via the canonical script
bash scripts/git-safe-push.sh "fix(feed): render thumbnail on /hub/social-media single+grid videos (no more black tile)"
```

The script must exit 0 with `DEPLOY_VERIFIED:true` and `SHA_MATCHED:true`
before this is considered shipped.

## Post-deploy verification

1. Open https://smarter.poker/hub/social-media on iPhone (Dan's primary).
2. Find the most recent video post (the 17-second clip he uploaded).
3. Confirm the tile shows the selected thumbnail (or first frame) instead
   of the black box with play button.

## Files changed (full diff context)

`pages/hub/social-media/index.js`:

- 1-up branch (around line 1011-1058): replaced bare `<video>` with
  conditional `<img>` (when `post.thumbnail_url || post.thumbnailUrl`)
  vs `<video src={url + '#t=0.001'}>` (fallback). VideoPostWrapper
  unchanged.
- 2-up branch (around line 1050-1100): same pattern inside the existing
  `<div onClick={...}>` wrapper. The play-button SVG overlay is
  preserved.

`scripts/yt-transcode-worker/index.js`:

- Switched yt-dlp format selector from
  `bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[ext=m4a]/...` to
  `bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b`. Comment block
  explains: avc1-only selector was capping output around 1.5 Mbps because
  YouTube reserves the high-bitrate 1080p tier for VP9/AV1. The
  downstream re-encode (preset=slow, crf=18, profile=high, 192k AAC)
  brings it back to a 5–8 Mbps H.264 mp4.

## Why earlier chunk-bust attempts didn't help

Commit `ffe571a1b3` added a fake top-level export to
`SmarterPokerStyleCard.jsx` to force webpack to rebuild the chunk. It
worked — the chunk was rebuilt — but the rebuilt chunk was never loaded
by `/hub/social-media` in the first place because that page imports its
post-rendering JSX from itself, not from `SmarterPokerStyleCard`. The
lesson is in `.agent/audits/2026-05-06-social-media-feed-render-path.md`
(write that on next pass if not already there).
