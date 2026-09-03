# The notifications popup stops booting a second application

**Date:** 2026-09-02
**Repo:** Smarter-Poker-World-Hub
**Branch:** `fix/notifications-popup-hardening` (third commit)
**Touches a protected file.** Authorised by Dan, 2026-09-02.

## What was wrong

Dan asked for a full-screen popup so that opening notifications does not take
you off the page you were on. The Hub delivered that by putting
`/hub/notifications` in an **iframe**.

That works, and it is expensive in a way the player feels. Every bell tap booted
a second Next.js application on top of the warm one: a fresh document, the Next
runtime, `_app`, hydration, a second Supabase client, a second auth read, a
second realtime subscription — and only then the feed request. All of it serial,
none of it something the already-loaded, already-authenticated Hub could
contribute to, and all of it behind a spinner.

Club Arena removed exactly this cost on 2026-08-27 and its popup now paints from
a warm cache on frame one. The Hub's still showed a spinner. Same product, same
gesture, two very different experiences.

## What changed

The feed moved to `src/components/notifications/HubNotificationsFeed.jsx` and is
now rendered **directly** by the popup. No frame, no second boot — a render,
like any other component.

- `pages/hub/notifications.js` is a thin route wrapper. **The route stays and is
  not a redirect:** push payloads, emails, bookmarks, `sitemap.xml` and
  cmd-clicking any bell all resolve there.
- `FullScreenPageOverlay` gained an optional `children`. Given children it
  renders them in place of the iframe and reuses every piece of chrome around it
  — topbar, Escape, scroll lock, focus handling. **Messenger, Settings and the
  Diamond Store still frame**, deliberately: they are opened rarely and the
  alternative is pulling three more page trees into the app shell.
- `GlobalPageOverlay` loads the feed with `dynamic(..., { ssr: false })`, so it
  is not in the shell's initial bundle. Every page pays for `_app`, and most
  sessions never open notifications.

## Following the protection workflow

`pages/hub/notifications.js` is listed in `.agent/PROTECTED_FILES.md` under
**DO NOT MODIFY: Notification fetching, display, click handlers, profile
navigation**, and `.agent/workflows/social-feed-protection.md` is mandatory
before touching it. It was followed.

**The move was made with `sed`, not by retyping.** That is the whole safety
argument, and it is checkable rather than assertable:

```
git show HEAD:pages/hub/notifications.js | sed -n '1,1074p' \
  | sed "s|from '../../src/|from '../../|g" > /tmp/orig-feed.jsx
diff /tmp/orig-feed.jsx src/components/notifications/HubNotificationsFeed.jsx
```

The diff is **only** the four additions below plus their comments. Every fetch,
every click handler, every `resolveNotificationRoute` call, every state variable,
every ref, the IntersectionObserver auto-read, the swipe-to-delete, the
friend-request accept/decline, the cross-tab broadcast and the poker-prefixed ID
branch are byte-for-byte what they were.

| # | Addition | Why it is required |
|---|----------|--------------------|
| 1 | `embedded` prop | What `isInIframe` used to detect. Rendered natively there is no frame to detect, so the caller says so. The iframe check is still there and still wins, so any surface that still frames this URL behaves exactly as before. |
| 2 | `onNotifCleared` callback | Framed, the badge count went up to the parent via `postMessage`. Natively there is no parent, so the count would never reach the header. The `postMessage` lines are untouched and simply no-op when unframed; both fire. |
| 3 | SEOHead skipped when embedded | A popup must not retitle the tab or rewrite the canonical URL of the page it is covering. |
| 4 | Realtime channel carries an instance id | Two copies can be alive at once — a player already on `/hub/notifications` who taps the bell — and two subscribers on one channel topic means the loser silently stops receiving inserts. Same defect found and fixed in Club Arena's surface the same day. |

## A guard fired, and it was right to

`__tests__/notification-route.test.mjs` — "every notification renderer delegates
to the shared resolver" — failed immediately after the move. Its list names the
files that RENDER notifications, and rendering had just moved out from under it.

The list was updated to the component, **not** relaxed. Pointing it at the new
thin page would have left a guard that passes while checking a file with no
click handlers in it, which is worse than no guard: the original bug this test
exists for was five renderers each deciding routes differently, and one of the
fixes was lost to a `git reset --hard` with nothing to catch it.

## Verification

| Check | Before | After |
|-------|--------|-------|
| `node scripts/test-article-reader.js` | 2/5 | 2/5 (unchanged — the social feed was not touched) |
| `__tests__/notification-route.test.mjs` + `notification-copy` + `global-header-approved` + `bottom-nav-clearance` | 51 pass | 51 pass |
| `npx next build` | clean | clean |

## Still not done

**Not browser-verified.** Dan's rule 5 is "verify on real hardware — it compiles
is not verification", and this has had static analysis, guard tests and a
production build, not a human opening the bell. That is the next step and it
should happen before this is trusted.

**Pagination.** `/api/notifications/feed` takes only `limit`, capped at 100, and
merges two sources behind an in-memory cache. A player with more than 100
notifications cannot reach the older ones from any surface. Real paging needs a
cursor across both sources; it is a separate piece of work, not a line change.
