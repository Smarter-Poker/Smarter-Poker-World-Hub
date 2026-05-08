# Audit: FeedVideoPoster — Round 2 (post-`5e42599bef`)

**Date:** 2026-05-08
**Scope:** `FeedVideoPoster` in `src/components/social/SharedVideoComponents.jsx`
**Method:** 4-pass max-rigor audit (Wiring → Real-Time → Adversarial → Edge cases), loop until 4 consecutive clean passes.
**Trigger:** Dan invoked the protocol naming "the feed video poster" as the target.

## Prior round (commit `5e42599bef`)

The first 4-pass audit on this component shipped fixes B1-B6 in `5e42599bef` ("4-pass audit — 6 bugs"). Those fixes are deployed (production SHA `43e0de6c`). They are still annotated in the source. This Round 2 starts from that baseline.

| Bug | Pass | Description |
|---|---|---|
| B1 | 1 | `imgFailed` missing from observer deps → no autoplay-on-scroll on Branch 1→2 transition |
| B2 | 1 | `<video poster>` reused failed thumbnail URL |
| B3 | 1 | `imgFailed` not reset when `thumbnailUrl` prop changes |
| B4 | 1 | YT URLs could land in `<video src>` via 2-up call site (bypasses VideoPostWrapper) |
| B5 | 4 | When both img + video pipelines fail, no gradient placeholder — `<video>`'s black background + VideoPostWrapper's play overlay recreated original symptom |
| B6 | 3 | `videoFailed` missing from observer deps → leaked observer when `<video>` errored |

## Round 2 findings (this audit)

Two NEW bugs not addressed by Round 1:

### B7 — YT branch chained `onError` infinite-broken-img loop (Pass 3)

**Severity:** Medium

**File:** `src/components/social/SharedVideoComponents.jsx`, YouTube branch

**Symptom path:** YT post where BOTH the user-supplied `thumbnailUrl` AND the YT-id-derived `https://img.youtube.com/vi/{id}/hqdefault.jpg` fail to load.

**Why it's a bug:** Round 1's YT branch used a single `setImgFailed(true)` for both attempts. When the user thumbnail 404s, `setImgFailed(true)` fires. Re-render: the IIFE evaluates to the YT-id URL. We render `<img src=ytHqdefault.jpg>`. If that ALSO 404s (deleted/private video), the `onError` calls `setImgFailed(true)` — but state is already true, React bails out, no re-render. The broken `<img>` element with `background:#000` and empty `alt=""` stays on screen with VideoPostWrapper's play button overlay = the original "black tile + play button" symptom we shipped this component to eliminate.

**Fix:** Separate `ytPosterFailed` state for the YT-derived poster path. Each path now has its own failure flag, so independent failures cleanly fall through to gradient. Reset `ytPosterFailed` when `videoUrl` prop changes (because YT id is derived from it).

**Reachability:** Affects any YT post where the user-uploaded thumbnail fails AND the YT video has been removed/privatized. Uncommon but real, especially for older posts.

### B8 — Observer doesn't attach on `thumbnailUrl` populated→NULL transition (Pass 4)

**Severity:** High (reachable RIGHT NOW due to in-flight migration)

**File:** `src/components/social/SharedVideoComponents.jsx`, observer effect deps

**Symptom path:** Realtime UPDATE clears `thumbnail_url` to NULL on a video post the user is currently viewing. Component transitions from Branch 1 (`<img>`) to Branch 2 (`<video>`), but `imgFailed` stays `false` throughout (img never errored — the URL just disappeared via prop change).

**Why it's a bug:** Round 1's observer effect deps were `[videoUrl, imgFailed, videoFailed]`. The Branch 1↔Branch 2 discriminator is `thumbnailUrl && !imgFailed`. When `thumbnailUrl` flips populated→null with `imgFailed` unchanged, none of the deps change, so the observer effect doesn't re-run. The previous render (Branch 1) had `videoRef.current = null` and bailed out. The new render (Branch 2) has `videoRef.current = <video>` but no observer attaches. Result on iOS Safari: pure black `<video>` element + VideoPostWrapper's play overlay = back to the original symptom.

**Reachable RIGHT NOW** because yesterday's migration `reencode_low_quality_youtube_reels_targeted` set `thumbnail_url=NULL` on 2,372 reels; `m7_2_mirror_all_video_posts` propagates that to `social_posts`; realtime fires UPDATE events to anyone with the feed open.

**Fix:** Add `thumbnailUrl` to observer effect deps. The effect early-returns at `if (!video) return` when we're in Branch 1, so redundant re-runs are cheap. Adding the discriminator's missing variable to deps makes every Branch 1↔2 transition correctly re-attach the observer.

## Loop verification

| Round | Pass 1 | Pass 2 | Pass 3 | Pass 4 | Result |
|---|---|---|---|---|---|
| 1 | clean | clean | found B7 | found B8 | restart |
| 2 | clean | scenarios A-I traced (incl. B7+B8 verification) | A11-A24 traced clean | E1-E15 traced clean | **DONE** |

Round 2 = 4 consecutive clean passes. Ship.

## Files modified

- `src/components/social/SharedVideoComponents.jsx` — three edits to `FeedVideoPoster`:
  1. Added `ytPosterFailed` `useState`
  2. Added `setYtPosterFailed(false)` to the `useEffect([videoUrl])` reset
  3. Replaced YT branch IIFE with two-step (thumbnail then YT-id) using separate failure flags
  4. Added `thumbnailUrl` to observer effect deps + comment block

No other files touched.
