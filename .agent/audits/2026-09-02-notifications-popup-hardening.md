# Notifications popup: badge acknowledgement, scroll lock, focus

**Date:** 2026-09-02
**Repo:** Smarter-Poker-World-Hub
**Branch:** `fix/notifications-popup-hardening`
**Follows:** PR #1256 (`.agent/audits/2026-09-02-notifications-popup-global.md`)

Three defects found while reviewing what #1256 left behind. All three predate
it; the popup made two of them visible and the third had been silently wrong
for as long as the overlay has existed.

## 1. The badge cleared from the bell and nowhere else

`UniversalHeader`'s bell onClick did the whole acknowledgement inline: zero the
count, write `sp-notif-count`, POST `/api/notifications/mark-read`. So opening
the **identical popup** from the bottom nav, the hamburger, `/hub/pages` or
Commander marked nothing read and left the count where it was.

That was survivable while those doors NAVIGATED — you left the page and the
header went with it. It stopped being survivable in #1256, which made them open
a popup: you read everything, dismiss it, and the bell is still sitting there
behind the popup claiming five unread.

Moved into `pageOverlayStore.acknowledgeNotifications`, called from
`openOverlay` whenever the page is `notifications`. Acknowledging now belongs to
the ACT of opening rather than to one control that happens to open. The helper
was **deleted** from `UniversalHeader` rather than left unused — a mark-all-read
function idle in a header is one `onClick` away from a second, competing writer.

### A second bug inside the first

The relayed count was a bare number, `notifClearedCount`. After the first open
it is 0, so a SECOND open — with realtime having pushed the badge back to 3 in
between — would set 0 over 0, change nothing, re-render nothing, and leave the
header showing 3 notifications that had just been read. It now carries a
timestamp (`notifCleared: { count, at }`) so a repeat clear to the same number
still propagates.

## 2. `FullScreenPageOverlay` blanked the scroll lock instead of restoring it

On close it ran `document.body.style.overflow = ''`, with a comment saying
"Always clear — don't restore saved value (race condition risk)".

Blanking is not the safe option, it is a silent bug. A page that had
deliberately locked its own scroll — a poker table, a modal already open beneath
the overlay — got quietly unlocked the moment somebody dismissed a notification
popup over it, and began scrolling behind content meant to hold it still.

There is no race to be afraid of: capture is per-open and restore is in that
same effect's cleanup, so a nested overlay captures `hidden`, restores `hidden`,
and the outer one still puts the true original back. Blanking is what loses
information.

## 3. No focus management at all

Focus stayed wherever it was on the page behind, and Tab walked straight into
the covered page. Now: focus moves to Close on open, Tab cycles between Close
and the frame, focus returns to the control that opened the popup on close.

**The honest limit:** once focus enters the iframe, that document owns the Tab
order and our `keydown` listener cannot see it, because events do not cross a
frame boundary. What is fixed is the part the parent can control. A feed
rendered natively rather than framed would be fully trappable — one more reason
to prefer one (see the open question below).

## 4. The close button had a sticky hover

`.fsp-close-btn:hover { transform: scale(1.1) }`. Most of this traffic is a
phone, where hover does not exist, and iOS *synthesises* one on first tap — so
the button stayed visibly enlarged after being tapped until something else was
touched. Replaced with `:active` (fires on touch) and `:focus-visible` (which
matters more now that focus starts there).

## Deliberately NOT done, and why

**Trimming what `_app` boots inside the overlay iframe.** The obvious
optimisation is to skip Geeves, Jarvis, the PWA prompt, the service-worker
updater and the second `UnreadProvider` realtime subscription when rendering
inside the popup. It does not work: `window.self !== window.top` is only
knowable client-side, so gating render on it either causes a hydration mismatch
or mounts everything once anyway and saves nothing. A change that looks like an
optimisation and is not is worse than no change.

**Back-gesture dismissal.** Android hardware back is the instinctive dismiss on
a phone, and today it navigates away from the page the popup is protecting.
Doing it requires injecting a history entry, and both apps have routers that own
history — Next's Pages Router here, react-router in Club Arena. A raw
`pushState` desyncs them. This is a real gap with a real cost; it is Dan's call
whether it is worth going near navigation, and I am not doing it on my own
authority given this estate's history with history.

## Still open, and it needs Dan

**The Hub popup is still an iframe.** Tapping the bell boots a second Next.js
application inside the popup — fresh document, `_app`, hydration, a second
Supabase client, a second realtime subscription — behind a spinner, before the
feed request starts. Club Arena's equivalent paints from cache on frame one.
The fix is to render the feed natively, which means extracting it from
`pages/hub/notifications.js`.

`.agent/PROTECTED_FILES.md` marks that file **DO NOT MODIFY: Notification
fetching, display, click handlers** and requires the `/social-feed-protection`
workflow. The extraction is behaviour-preserving in principle, but that file is
1082 lines of inline swipe handling, friend-request accept/decline, realtime,
broadcast sync and route resolution — exactly the shape the protection exists
for. Not proceeding without explicit sign-off.

## Verification

- `npx next build` — full production build, clean.
- `node --test __tests__/global-header-approved.test.mjs __tests__/bottom-nav-clearance.test.mjs`
  — 14 tests green, including the pin on `openOverlay('notifications')` living
  in the header, which this change preserves.
