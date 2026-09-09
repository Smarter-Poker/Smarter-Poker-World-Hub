# 2026-09-09: Always-Displayed Mobile Standard, Phase 4 (Personal Assistant)

Dan, 2026-09-03: phase 4 of the mobile rollout is Personal Assistant, and
every one of the ten pages gets its own tutorial. Standard:
`docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`; every-phase list:
`ROLLOUT-PLAN.md`.

Three routes, one product: `/hub/personal-assistant` (the hub),
`/hub/personal-assistant/leaks` (Leak Finder) and
`/hub/personal-assistant/sandbox` (the verified-evidence gate).

## 1. No slide to see

- **The five section anchors.** `.tabs` was a `display: flex` scroller below
  640 with `overflow-x: auto`, `scroll-snap-type: x mandatory`,
  `scrollbar-width: none`, `::-webkit-scrollbar { display: none }` and
  `flex: 0 0 126px` cards. Two of the five were off the right edge at 375 with
  no scrollbar to say so. It is now a wrapping grid,
  `repeat(auto-fit, minmax(104px, 1fr))` at 768 and `minmax(96px, 1fr)` at
  600, inside the same chrome frame it has on desktop.
- **The leaks trend row.** `trendPointRow` carried a comment calling it a
  "deliberate horizontal snap carousel", and its reasoning was sound: one
  auto-column per point with no minimum squeezed 7 runs to ~36px and 12 runs
  to ~21px at 375, breaking the 44px target and clipping the labels. But the
  carousel solves that by putting points off the right edge, and a trend is
  only readable whole. It is now `flexWrap: 'wrap'` with `flex: '1 0 auto'`:
  the 44px targets are kept AND every point is on screen, five per row at 375.
- **The Coaching workspace views.** `.viewNav` was
  `repeat(6, minmax(72px, 1fr))` inside `overflow-x: auto`, and a second rule
  below 560 re-forced `repeat(6, minmax(82px, 1fr))` - 492px of track inside a
  375px screen. Both are now `repeat(auto-fit, minmax(104px / 88px, 1fr))`,
  and the scroller is gone.
- Zero occurrences of `scrollbar-width: none`, `scroll-snap-type`,
  `scrollSnapType` or the webkit scrollbar cull across the three pages, the
  two world CSS modules and `src/components/personal-assistant/**`.

## 2. Nothing is culled

- `.loopLabel { display: none }` at 960 took the words "Decision Loop" off the
  row below every desktop width, leaving three numbered steps with nothing
  naming them. The label now spans the row at 900 and sits above the steps at
  768.
- `.sessionDate { display: none }` at 640 hid the one field that tells two
  sessions apart. The session card is now two rows on a phone: marker and
  title on the first, date and EV on the second.
- `display: none` count across the three CSS files: 0.

## 3. Shell, foundation and the double bottom pad

`<HubPageShell className="pa" maxWidth={1240}>` owns the hub shell. The page
CSS carried `padding-bottom: calc(88px + env(safe-area-inset-bottom))` (72px
below 640) while `pages/_app.js` was ALSO rendering `BottomNavSpacer` for it -
all three routes have been in `src/config/bottom-nav-routes.json` the whole
time - so the page ended in about 150px of nothing. The page-owned pad is
gone; the spacer is the single clearance.

`min-height: 100vh` becomes `100dvh` on the hub and the sandbox route (on iOS
Safari `100vh` is the TALLEST the viewport ever gets, so the last rows sit
under the URL bar). `overflowX: 'hidden'` on the leaks page root and
`overflow-x: hidden` on the sandbox root become `clip`: a bare `hidden` makes
the element a scroll container on WebKit and re-parents every `position:
fixed` descendant to it, which is what unsticks the bottom nav.

The rest of the phase 0a set:

- `useLoadFailsafe` caps the load at eight seconds. `useRecentSessions` and
  `useAssistantStats` own their own `isLoading`, and a request that never
  settled used to pin the Priority Queue on "Calibrating" forever. The page
  mirrors both flags into one it owns, caps that, and every render-time "is it
  loading" read goes through the capped pair (`statsBusy` / `sessionsBusy`).
  The underlying hooks are untouched, so a late answer still lands.
- `useOnlineStatus` + `requireOnline()` on all three network actions: the hub
  retry, the daily-hand reload and leak detection. `OfflineBar` in `_app.js`
  stays the global banner; these are the per-action guards.
- `useHaptics` on every navigation tap and on the audit run.
- `PullToRefresh` around the hub content, disabled while the menu is open.
- `useModalHistory` so Back closes the hamburger, and on leaks the leak detail
  sheet, before it leaves the route.
- A first-paint skeleton. The hub used to swap the entire document for one
  centred 12px "Initializing Jarvis" line until `mounted` flipped, so the
  largest contentful paint was that string. The shell, header and the five
  anchors now paint on the server and only the data blocks are placeholders,
  at the heights of the real content so nothing jumps.

## 4. Text

No font under 12px on the surface. 30 declarations between 7px and 11px were
re-laid at 12px with the letter-spacing and line-height adjusted so the
console rows still fit at 375: `PersonalAssistantHub.module.css` (24),
`PersonalAssistantTools.module.css` (8), `CoachingWorkspace.module.css` (8),
`shared/CardPicker.jsx` and `shared/TrustSeal.jsx` (5), and the
`.pa-sheet-telemetry` rule in `paKit.jsx` that renders inside every PA bottom
sheet. Two truncating rules went with them: `.loopStep small` and
`.activityContent > span` were `white-space: nowrap` with an ellipsis, so the
label they carried was often three words of a sentence.

## 5. Breakpoints

Four became three. `PersonalAssistantHub.module.css` had 960 / 640 / 380 and
now has 900 / 768 / 600; `sandbox.js` had its own 640 and now has 768;
`CoachingWorkspace.module.css` had 560 and `min-width: 760` and now has 600
and `min-width: 769`.

## 6. The tutorial

`src/tutorials/personal-assistant.js`: eight steps (Meet Jarvis, Everything Is
On One Screen, The Jarvis Priority Queue, The Decision Loop, Leak Finder And
The Evidence Gate, Your Dashboard Numbers, Activity And Your Recent Sessions,
Hand Of The Day And Where To Find This Again). Title Case, no em dashes.

Registered as a PREFIX row for `/hub/personal-assistant`, so the hub, leaks
and sandbox all offer the same tour. Each step names alternative targets
(`a|b|c`) so it rings something real on whichever of the three you opened it
from: `nav`, `mission`, `loop`, `systems`, `stats`, `activity`, `sessions` and
`daily` on the hub; `leak-views`, `leak-list` and `detect` on leaks;
`evidence-gate` and `sandbox-destinations` on the gate.

The wording never promises a grade this platform will not stand behind. The
evidence boundary is the ruling on this surface, and step five says plainly
that approximate grading is retired and anything scored is backed by a signed
Training attempt.

## 7. Tests, laws, budget

- `__tests__/pa-mobile-upgrades.test.mjs` (new, 13 tests): the foundation
  imports, the offline guard on each of the three network actions, the render
  reading the capped loading pair rather than the raw hook flags, no hidden
  rail in any of the eleven files, no `display: none` cull, `100dvh` and no
  bare `overflow-x: hidden`, no second bottom pad (and all three routes
  present in `bottom-nav-routes.json`), the 12px floor, the three
  breakpoints, no `window.innerWidth` / `matchMedia` render branch, the
  tutorial registered as a prefix with eight steps and every target present,
  and the budget row converted.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8 fails on a
  guard nothing runs).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4]`, and
  `src/components/personal-assistant` added to the phase 4 target list.
- `__tests__/page-tutorials.test.mjs`: phase 4 in `LANDED`, with leaks.js and
  sandbox.js as the `also` files carrying the rest of its targets.
- `scripts/ci/mobile-budget.json`: `/hub/personal-assistant` flipped to
  `converted: true` (12px floor and 44px targets now enforced in CI) and its
  LCP budget lowered from 3500ms to 2500ms.
