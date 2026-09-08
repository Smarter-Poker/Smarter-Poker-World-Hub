# Social Media Deep Dive — 2026-09-08

Scope: `/hub/social-media` and every route the social footer reaches
(`/hub/reels`, `/hub/friends`, `/hub/messenger`, `/hub/social-pages`,
`/hub/saved-posts`, `/hub/post`, `/hub/user`, `/u`), the `src/components/social/*`
layer, the nav/footer config, and the API + Supabase wiring behind all of it.

Four passes: the 8,105-line feed page, the component layer, the routing surface,
and the data layer (verified against the live `PokerIQ-Production` DB with read
queries only).

---

## 1. The oval avatar

**Cause.** The ringed avatar wrappers in `SharedPostCreator` were `display: block`
elements containing an `inline-block` avatar. A block wrapper puts that avatar on
a text baseline, and the descender space *under* the baseline is added to the
wrapper's height — but not its width. Measured in your screenshot: **44px wide ×
51px tall**. Measured live against the site's own stylesheet: **44 × 52.6**.

That is also exactly why Profile looked right. The Profile branch has no ring, so
the extra space below the baseline is invisible — the avatar itself was always a
perfect circle. Only the branches that draw a border around the wrapper (club
pages, home groups) exposed it.

**Fix.** New `.sp-avatar-ring` class (`src/index.css`) — `inline-flex` +
`line-height: 0`, which removes the baseline gap — applied to all four composer
branches. Added a defensive catch-all for any `<a>` carrying an inline
`border-radius: 50%`, mirroring the rule that already existed for `<button>`;
without it the mobile `a { min-height: 44px }` rule can do the same thing again.
Also fixed the same bug on the leaderboard podium ring (`pages/hub/leaderboards.js`).

**Verified live:** old markup `44 × 52.6` (ratio 0.837) → new markup **`44 × 44`,
ratio exactly 1.000**.

## 2. The footer

**Cause.** The dock's box was `width: 100%` × a fixed
`clamp(44px, 12.326vw, 132px)` height, with the artwork stretched into it by
`object-fit: fill`. The artwork is 6.537:1. The box is 8.11:1 up to 1071px wide
(where the clamp pins at 132px) and then unbounded — **9.70:1 at 1280px**,
14.55:1 at 1920px. `fill` absorbed all of that as horizontal stretch: **24% on
every phone, 48% at 1280px**. Confirmed by measuring the live site: stage
`1280 × 132`, stretch factor **1.483**.

The "pixelation" is the same bug. Stretching horizontally (0.50×) while compressing
vertically (0.35×) is a non-uniform resample, and a fine quilted diamond texture
aliases badly under that — hence the shimmer and the ragged bevel.

**Fix** (per your choice: uniform height, no distortion). The stage now carries the
artwork's own aspect ratio and is centred by the nav's existing `justify-content:
center`. Height still tops out at the shared `FOOTER_ARTWORK_HEIGHT`, so the Club
Arena gold standard is untouched. The hit zones are positioned in percentages *of
the stage*, so they follow the new box exactly — no re-mapping needed.

**Verified across 8 viewport widths × all 14 worlds:** stretch deviation
**≤0.0004** (float rounding) everywhere, no overflow anywhere, and above the
clamp point every world is exactly **132px** tall. Social-media renders
**863 × 132** centred, instead of 1280 × 132 stretched.

> **One tradeoff to know about.** Below the clamp point the worlds' heights differ
> slightly, because each keeps its own shape and the width is capped by the
> viewport — at 390px, News is 46.9px tall against Social's 48.1px. Before, all
> worlds were exactly `12.326vw`. Uniform height is preserved on desktop, where it
> is visible; ~1-6px of variance on a phone is the price of not stretching.

---

## 3. Audit — fixed

### Feed page (`pages/hub/social-media/index.js`)

| Sev | What was wrong |
|---|---|
| HIGH | **The feed never ended.** `loadMoreCallbackRef` is a `useCallback([])`, so its observer reached the mount-time `loadFeed`, where `feedCycle` was frozen at `0` forever. `MAX_FEED_CYCLES` was unreachable, `hasMorePosts` never went false, and "You're All Caught Up!" never rendered — it just looped the same posts. Now reads `feedCycleRef`, the same pattern the offset/hasMore/loadingMore refs already used. |
| HIGH | **Share links and notification links were being thrown away.** `?post=` injected the post, then the mount effect's `loadFeed` resolved later and called `setPosts(formattedPosts)`, replacing the array. Since `/hub/post/[id]` and every like/comment/mention notification route here, this was the whole share surface. The post is now pinned through the feed load. It was also missing `timeAgo`, so it rendered with a blank timestamp. |
| HIGH | **"View More Comments" skipped or re-fetched rows.** It passed `comments.length` as the DB offset, but that array also holds optimistic entries, realtime-injected ones and replies. Now tracks the server-returned count. |
| MED | **@mentions in post bodies did nothing.** Blue, `cursor: pointer`, no `onClick`. The working `renderMentions()` was only used for comments. Its regex also differed (`@\w+` vs `@[\w.]+`), so usernames with a dot split differently in posts than comments. Now uses `renderMentions`. |
| MED | **Stale avatar and name on every post card after a profile edit.** The `React.memo` comparator omitted `currentUserName`, `currentUserAvatar` and `horseProfileIds`; since `currentUserId` doesn't change on an edit, every card returned "equal" and never re-rendered. The horse online dot never appeared either. |
| MED | **`?ref=` could auto-follow twice.** No idempotency guard (unlike `?post=` and `?stream=`), and the effect depended on the whole `user` object, which is replaced at least once per session. Added a guard; dep narrowed to `user?.id`. |
| MED | masterBus `SOCIAL_POST` listener called `loadFeed` directly instead of `loadFeedRef.current` — the one long-lived listener in the file that didn't. |
| MED | Empty state tested the *unfiltered* `posts`. If every loaded post was from a blocked author you got a blank region with no message. |
| MED | `page.name.charAt(0)` in the sidebar shortcuts crashed on a page row with a null name (the same access is guarded elsewhere in the file). |
| LOW | `.then(setLiveStreams)` without the `|| []` guard used at the other three call sites. |
| LOW | `?view=club-pages` only worked on a cold load — it read `window.location.search` in a `useEffect([])`, so arriving from the hamburger while already on the feed never opened the panel. |
| LOW | The feed URL appended `&user_id=<uuid>`, which the API ignores (it uses the JWT). All it did was put a user UUID into every CDN and access log line. Removed. |
| LOW | Removed three dead symbols: the `ChatWindow` dynamic import (never rendered), the `CheckInModal` import (the feature lives in `SharedPostCreator`), and the `viewingClubPage` state. |

### Navigation

- **The footer's "Create" button did nothing.** It pointed at `/hub/social-media/compose`, which is a redirect stub — tapping Create flashed a blank page and bounced you back to the feed, the same place the Feed button one slot left already goes. Now `?compose=1`, handled by a new `sp-focus-composer` event that scrolls to and focuses the inline composer.
- **`/hub/saved-posts` was unreachable.** A complete, working 322-line page with zero inbound links anywhere — no menu row, no footer slot, no `Link`. Added a sidebar tile.
- **Favourite-venue shortcuts went to the wrong page.** `/hub/poker-near-me/<uuid>` hits the tab route, whose parser only knows tab slugs; a UUID fell through every branch and silently rendered the generic lobby. Now `/hub/venues/<id>`, which the same file already uses elsewhere.
- **Blocked / Message Requests lied to signed-out visitors** — both rendered "No Blocked Users" / "No Message Requests", an affirmative claim about an account they never looked at. Now a sign-in prompt, matching every other page in the section.

### Components

- **Go Live thumbnails had no validation.** `accept="image/*"` is a hint only. Any file of any size went straight to upload. Now enforces image type and the same 4.5MB ceiling `SharedPostCreator` uses.
- **"Copy Link" reported success without copying.** With no Clipboard API (insecure origin, older browser) the optional chain returned `undefined`, `await undefined` resolved, and the handler showed "Link copied!" *and* incremented the server-side share count. Now throws into the existing catch, with a legacy `execCommand` fallback.
- **LiveKit track was attached to the `<video>` element and never detached** — LiveKit kept a reference to a DOM node from an unmounted component. Added `detach()` and an explicit `srcObject = null` on cleanup.
- **Trending Venues could spin forever.** `if (!data.success) return;` sat inside the `try` and skipped the `setLoading(false)` after it. Moved into a `finally`.
- Removed the dead `onOpenClubPages` prop (declared, passed, never used) and the dead `success_count` field (sent, never read by the endpoint).

### Data layer

*Nothing missing.* All 43 RPCs, 72 tables/views and 70 API endpoints referenced by
this surface resolve. No dangling `fn_*`, no phantom table, no 404 endpoint. Auth
on `pages/api/social/**` is clean — every write path verifies the session, none
trusts a body-supplied `userId`, and the service-role key is never on an
unauthenticated write path.

- **HIGH — "someone shared your post" notifications never sent.** The insert omitted `title`, which is `NOT NULL` with no default and no trigger filling it, so it failed `23502` every time and the error was swallowed into a `console.warn`. Confirmed: **zero rows** with `type='share'` in the live table. Added the field.
- **MED — `/api/social/feed` never actually filtered deleted posts.** The comment claims a server-side filter was added; only the `select` list changed. Deleted rows were dropped in JS *after* the `limit + 1` over-fetch, so one deleted row in a page would silently end infinite scroll — and `=== false` also dropped `NULL` rows. Now filters server-side with `not.is.true` (NULL-safe). Verified against the live DB: identical 3,394 rows kept, no behaviour change today, correct when soft-delete is used.
- **LOW — two share endpoints returned an opaque 500 instead of a 400** on an unparseable body, because `req.body` was destructured before the `try`.

---

## 4. Needs your call — not fixed

### CRITICAL — the camera and mic are never released

`GoLiveModal.jsx:641` declines to stop the MediaStream and points at a cleanup
owner that does not exist. `releaseMediaStream()` is a no-op unless
`{force: true}`, and a repo-wide search finds exactly **one** caller — the
black-frame watchdog inside GoLiveModal itself. There is no page-level handler, no
`routeChangeStart` hook and no logout hook anywhere. The stream survives modal
close, client-side navigation and logout — **camera and mic stay live until a full
page reload.**

I left this alone because the singleton exists to stop iOS re-prompting for
permission, and the obvious fix (release on modal unmount) would reintroduce that.
The right fix is a `routeChangeStart` release plus a logout release, and it needs a
device test that reopening Go Live within one page session still doesn't re-prompt.
**Worth doing next.**

### HIGH — four component files are forks of the whole feed page

`ChatWindow.jsx`, `ClubPagesView.jsx`, `PublicGameBoard.jsx` and
`ClubPageDashboard.jsx` are the feed page with a different component appended:

| File | Lines | Identical to `index.js` | Real component starts |
|---|---|---|---|
| `ChatWindow.jsx` | 3,650 | 3,495 (**95.8%**) | L3159 |
| `ClubPagesView.jsx` | 4,218 | 3,545 (**84.0%**) | L3503 |
| `PublicGameBoard.jsx` | 4,511 | 3,652 (**81.0%**) | L3530 |
| `ClubPageDashboard.jsx` | 6,587 | 3,680 (**55.9%**) | L3503 |

The duplicated prefix is entirely unreachable — `<PostCard` appears zero times in
all four. Each also carries its own copy of the protected-file banner (with the
same stale line numbers) and statically imports the heavy tree — GoLiveModal
177KB, ReelsFeedCarousel 161KB, SharedPostCreator 117KB — which defeats the
`dynamic()` split in `index.js`. And each has its own `getTypingChannel()`
singleton claiming the topic `'social-feed'`, so 2–5 realtime channels open on one
topic — the exact leak the comment in that function says it fixed.

~14,000 dead lines. Mechanical to remove, but it's a big deletion that deserves its
own PR and its own test pass.

### Other items left for you

- **Reels carousel renders once, not "after every 3 posts"** as the protected header claims (`index.js:7698`, `index === 2`). Either fix the code or fix the comment — I don't know which is intended. Note that N carousels means N reels fetches.
- **The "club posts only" filter can never be turned on.** `setShowClubPostsOnly` is called in exactly one place and sets `false`. Both filters and the "No Club Posts Yet" empty state are unreachable. Wire it to the identity switcher, or delete it.
- **"Not Interested" on feed reels does nothing.** `notInterestedIds` is stored and updated but never read by the carousel's filter — so a reel you dismissed disappears from `/hub/reels` and keeps showing in the feed. The fix needs a `loadReels` dep-array change that also affects its realtime debounce.
- **GoLiveModal never unmounts** (`isOpen` returns `null` but state persists), and only one of three close paths resets it. Closing via the backdrop skips `revokeObjectURL` and the blob/thumbnail resets, and `setTitle('')` is never called anywhere — so an abandoned session's title is pre-filled next time.
- **~195 lines of dead `LinkPreviewCard`** in `index.js:128-323`, carrying a "DO NOT MODIFY — this has broken 4+ times" banner. It is unreachable; article rendering goes through `ArticleCard`. The stale banner actively misleads anyone editing the file. Same for `AMENITIES_LIST` (78 lines), `DAYS`/`DAY_LABELS`, and ~10 unused imports.
- **The protected-file header's line numbers are all wrong** — by thousands of lines, every one of them. Worth dropping the numbers and keeping the feature names.
- **`ClubPageCreateModal.jsx` is a dead file** with zero importers; five identical inline copies are the live ones.
- **96 `onClick` handlers on `div`/`span` with one `role=` and zero `tabIndex`** across the feed page — including primary actions (comment Like/Reply/Edit/Delete, sidebar tiles, "See More", notification rows). Keyboard and screen-reader users can't reach them.
- **Two profile routes.** `/u/[username]` is complete and correct but orphaned; everything links to `/hub/user/[username]`. Pick one and redirect the other so external shares keep working.
- **Three Messenger hamburger rows are dead** (`?filter=all|unread|archived` — `messenger.js` reads no `filter` param and has no "archived" concept), and `/hub/live-help` redirects to `?chat=jarvis`, a param Messenger never reads.

---

## Rebase note

The audit was performed in the shared clone, which turned out to be **184 commits
behind `origin/main`** — six of the files involved had moved. Everything here was
therefore re-applied onto current `main` (`fa0ae14ba5`) in an isolated worktree
before shipping. Fifteen of sixteen files re-applied cleanly, which confirms the
findings still describe live code. One real conflict: commit #1495 had added
`<PokerCardText>` rendering to the exact post-body branch where the @mention fix
lands. Resolved hunk by hunk so both survive — mentions navigate *and* poker cards
still render. The footer constant had also moved (`13.72vw` → `12.326vw`); the fix
derives its width from the constant rather than restating it, so it picked the new
value up automatically, and the figures above were re-measured against it.

## Verification

- Every edited file was checked for structural integrity differentially against
  `HEAD` — bracket balance is byte-identical in all 16, so no edit unbalanced a
  block.
- Avatar and footer geometry were measured in a real browser against the live
  site's own stylesheet, before and after (numbers in §1 and §2).
- The `is_deleted` filter change was verified against the live DB to keep exactly
  the same row set.
- `npm`/`pip` are blocked in this sandbox and `node_modules` isn't mounted, so I
  could not run the build, the linter, or the test suite. **Run
  `npm run build` and `node scripts/test-article-reader.js` before shipping** —
  the latter is what the protected-file header asks for, and `index.js` is the
  file it protects.
