# Notifications open as a full-screen popup everywhere, not only from the bell

**Date:** 2026-09-02
**Repo:** Smarter-Poker-World-Hub (a matching change lands in club-arena)
**Branch:** `fix/notifications-fullscreen-overlay`

## What Dan asked for

Verbatim, with a screenshot of `smarter.poker/hub/club-arena/notifications`:

> "WHEN YOU CLICK ON NOTIFICATIONS, IT SHOULDN'T OPEN TO ITS OWN PAGE, IT SHOULD
> CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON THE PAGE YOU WERE ON... YOU
> SHOULD BE ABLE TO 'X' OFF THE NOTIFICATIONS POP UP AND STAY ON THE SAME PAGE
> YOU WERE ON STILL. THIS SHOULD WORK LIKE THIS INSIDE THE WORLD HUB, CLUB ARENA
> AND CLUB COMMANDER PAGES. MAKE THESE CORRECTIONS GLOBALLY NOW PLEASE."

## The finding: this was built, and then not connected

The popup was **already working from one control**. `UniversalHeader`'s bell has
called `openOverlay('notifications')` for months; `FullScreenPageOverlay` had
escape-to-close, a scroll lock, an `about:blank` teardown and a same-origin
`postMessage` bridge; `pages/hub/notifications.js` already checked
`window.self !== window.top` and hid its own header and hamburger when framed.

The defect was the **scope of the open flag**: `const [overlayPage,
setOverlayPage] = useState(null)`, inside `UniversalHeader`. Two consequences,
and the second is the one that made it unfixable in place:

1. Only that header's own buttons could open it. Everything else navigated.
2. **`UniversalHeader` is rendered per-page, not by the app shell** — its own
   comment says so, and `_app.js` supplies it only for the routes listed in
   `HUB_ROUTES_WITHOUT_SHARED_HEADER`. Club Commander pages use
   `CommanderPageShell` and mount no `UniversalHeader` at all, so a
   header-owned overlay could never have satisfied "and Club Commander pages".

Doors that were still navigating as of this morning:

| Door | File |
| --- | --- |
| Bottom nav "Alerts" (both renderers) | `src/components/ui/BottomNavBar.jsx` |
| Hamburger: All / Mentions / Friend Requests / world-menu row | `src/config/hamburgerMenus.js` via `src/components/ui/HamburgerMenu.jsx` |
| `/hub/pages` footer "Alerts" | `pages/hub/pages.js` |
| Club Arena dropdown "View All Notifications" | `src/components/club-arena/NotificationBell.js` |
| Commander profile menu | `pages/hub/commander/profile/index.js` |

The bottom nav is the one most players use on a phone, and it was on the wrong
side of the split.

## What changed

- **`src/stores/pageOverlayStore.js` (new).** The open flag, the page → url →
  title table, and the relayed `SP_NOTIF_CLEARED` count. Callers say *what* they
  want open, not where it lives, so the bell and the footer cannot drift onto
  two different notification pages. `profile` is the one key whose address
  depends on who is signed in, so that caller passes an explicit url.
  It refuses to open **inside an iframe** and navigates the frame instead —
  `_app` (and therefore this overlay) runs inside the framed page too, and a
  trigger reached from in there would otherwise stack a second full-screen popup
  inside 100% of the first, with two escape handlers and two close buttons.
- **`src/components/ui/GlobalPageOverlay.jsx` (new), mounted once in
  `pages/_app.js`** beside `ToastContainer`, inside a `HubErrorBoundary`. This
  is what makes the behaviour reach Commander and every route whose page does
  not render the shared header.
- **`UniversalHeader`** now reads and writes the store. Its local
  `overlayPage` state, `overlayUrlMap`, `OVERLAY_TITLES` and its
  `<FullScreenPageOverlay>` render are gone; `handleNotifCleared` became an
  effect watching `notifClearedCount`, so the badge still clears the instant the
  popup reads them. **`openOverlay('notifications')` is deliberately kept as the
  literal call site text** — `__tests__/global-header-approved.test.mjs:90` pins
  that string, and it is still the honest name for what the wrapper does.
  Both fixes previously recorded on that render block still hold in its new
  home: rendered unconditionally and driven by `isOpen` (it once had a hardcoded
  `isOpen={true}` behind a `{overlayPage && ...}` gate, making the component's
  entire `!isOpen` branch dead code), and stable callback identities rather than
  inline arrows, which used to tear down and re-add the keydown and postMessage
  listeners on every notification/balance tick.
- **Every door above** now opens the popup. All of them stay real links, and
  each checks the modifier keys before `preventDefault`, so cmd/ctrl/shift/
  middle-click still opens `/hub/notifications` in a new tab — the popup has no
  address, and that is the only way to get one.
- The hamburger interception lives in the **shared row handler**, keyed on the
  href, so all four config entries behave identically and a fifth cannot be
  added the old way. Filtered variants keep their query string, so "Mentions"
  opens the popup already filtered. `/hub/settings/notifications` is a real
  settings page and deliberately still navigates.

## A dead surface found on the way — decided, not deferred

`pages/hub/commander/notifications/index.js` reads
`/api/commander/notifications/my`, `/api/commander/notifications/[id]` and
`/api/commander/notifications/mark-all-read`. **`pages/api/commander/` in this
repo contains only `home-games/` and `tournaments/`.** Those three endpoints do
not exist here, so that page has been rendering a permanent empty state for
however long it has been shipped.

Commander's Notifications entry now opens the **canonical** feed
(`/hub/notifications`) in the popup. Dan, 2026-08-25: "we need ONE DISPLAY" —
Commander notifications are the same player's notifications. This fixes the dead
surface as well as satisfying the popup request.

The Commander page and its missing API are **left in place and raised here**
rather than deleted: whether Commander should ever have had a separate feed is a
product question, and deleting a route to tidy up a symptom is how the next
agent inherits a mystery.

## Not touched, on purpose

`vendor/commander-shared/.../CommanderLayout.jsx:895` has its own bell doing
`router.push('/hub/notifications')`. It is a vendored package, re-exported by a
one-line shim, and **no page under `pages/` imports `CommanderLayout`** —
Commander pages use `CommanderPageShell`. Editing a vendored copy is the wrong
layer and the edit would be lost on the next sync. Noted so it is not mistaken
for an oversight; if that layout is ever mounted, it needs the same one-line
change.

## Verification

- `node --test __tests__/global-header-approved.test.mjs __tests__/bottom-nav-clearance.test.mjs`
  — 14 tests, all passing, including "World Hub header wires all approved
  controls", "Commander consumes the same approved row", "pages and feature
  shells cannot mount or size the shared footer independently", and "all 264 Hub
  page modules own the shared header or inherit the app-root fallback".
- `npx next build` — full production build, clean.
