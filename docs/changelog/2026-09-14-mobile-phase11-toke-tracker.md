# 2026-09-14: Always-Displayed Mobile Standard, Phase 11 (Toke Tracker)

The ten pages Dan listed on 2026-09-03 are done (phase 8 retired with the
standalone Diamond rollout). Toke Tracker is the one World menu root left
unconverted that is a real page rather than a redirect: `/hub/my-clubs` and
`/hub/marketplace` are both `getServerSideProps` redirects with no UI to
convert. So phase 11 is Toke Tracker and its four rooms.

Standard: `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`;
every-phase list: `ROLLOUT-PLAN.md`. Routes: `/hub/toke-tracker`, `/shift`,
`/analytics`, `/vault`, `/venues`.

Measured before, on production at 375, signed in as the service account: no
sideways overflow (these pages were already narrow), but 2 tap targets under
44px on Venue Intel, a 14px text input on Shift, four charts and four
document categories each hidden behind a tab strip, and every one of the five
pages carrying `minHeight: 100vh`, `paddingBottom: 70` and
`overflowX: 'hidden'` with no shell, no failsafe, no pull to refresh and no
tutorial. After: 0 targets under 44px, 0 text nodes under 12px, every chart
and category on the page, and the tutorial prompt on all five.

## 1. What changed

- **The five pages are shells.** Each renders
  `<HubPageShell className="toke" ...>` with the shared `UniversalHeader` and
  `HamburgerMenu`, and nothing else of its own chrome. `100vh`,
  `paddingBottom: 70` (which doubled the app shell's `BottomNavSpacer`),
  `overflowX: 'hidden'` and the `PageTransition` wrapper are gone. Layout
  lives in the new `src/styles/worlds/toke-tracker.css`, scoped under
  `.toke-page`, with the three sanctioned breakpoints and nothing else.
- **One preference hook instead of five copies.** All five pages carried the
  same forty lines: hydrate from `localStorage`, mirror into
  `profiles.settings.tokeTracker`, sync across tabs on a
  `toke-settings-sync` event, hand three setters to the hamburger. The copies
  had already drifted, with the landing page reading Supabase first and the
  four rooms reading only `localStorage`. `src/hooks/useTokePrefs.js` is now
  the one implementation and reads both, local first for speed.
- **Analytics shows all four charts.** `TokeDashboard` had a four-button tab
  strip that unmounted three charts at a time. The cumulative trend, the
  per-event bars, the monthly bars and the down-type donut now render one
  under another, each under its own heading, and the panel opens expanded.
- **The Dealer Vault shows all four categories.** Same shape of defect: the
  tab decided both which documents you could see AND which fields the upload
  form asked for. Every category is a section with its own heading and count;
  the upload form asks for the category in a labelled select (so a dealer can
  correct what the reader guessed instead of retyping it into another tab);
  the year filter stays, labelled, and applies to the two year-keyed
  sections. The OCR path is untouched: `handleFileSelect`, `analyzeDocument`,
  `downscaleForOcr`, `readText`, `readPdf` and `reportReaderFailure` are the
  same lines their three law tests pin.
- **The year calendar is usable with a thumb.** It drew three months across a
  375px phone, which made each day a 15px tap target, and only the ONE month
  you expanded got the real 44px grid. There is now one grid, always the full
  one, every day a `<button>` at least 44px tall, one month per row on a
  phone and two or three across on a desktop
  (`repeat(auto-fill, minmax(280px, 1fr))`). Twelve full months is 3,000px of
  empty calendar on a phone, so the year is bounded the way phase 9 bounds
  the Video Library's rows: three months from today plus every month that
  holds an event, then a 44px `Show All Twelve Months Of 2026` button. The
  year arrows were 28x28 and are 44x44 with `aria-label`s.
- **Foundation.** `useLoadFailsafe` + `useInitialLoadRef` on the two pages
  that fetch gigs (vault, venues); `PullToRefresh` on all four rooms, each
  refusing with the standard offline toast when `requireOnline()` says no;
  `useHaptics` on card taps, Add Down, Expense, Close Day, End Down, a
  calendar day and Show All Months; `useModalHistory` on all eight sheets
  (receipt lightbox, toke-on-end, Add Down, Add Expense, delete confirm, Tax
  Summary, and the calendar's two), so the phone back gesture closes the
  sheet instead of leaving the page.
- **Text and targets.** The Jarvis question box was 14px, which zooms iOS on
  focus; every input on the surface is exactly 16px and 44px tall, in the
  source and again in the CSS. The toke display (26px), the inline toke and
  multiplier editors, End, the down delete and edit buttons, the event
  edit/delete row, the goal Edit button and the two top action buttons are
  44px. The day's downs sat in a `maxHeight: 300, overflowY: auto` scroller,
  which hid the early downs of a long shift behind a second scrollbar; they
  render in full.

## 2. The tutorial

`src/tutorials/toke-tracker.js`: eight Title Case steps (Welcome To Toke
Tracker, The Four Rooms, Start An Event, Log Every Down, Read The Trends, The
Dealer Vault, Venue Intel And The Calendar, Where To Find This Again), no em
dashes, registered as a PREFIX row so the tour opens from any of the five
pages. Targets: `title` (all five), `cards`, `shift`, `event`, `analytics`,
`vault`, `venues`, `calendar`; every step names alternatives so a step whose
element is on another page still reads.

## 3. Tests, laws, budget

- `__tests__/toke-tracker-mobile-upgrades.test.mjs` (new, 8 tests): the
  foundation on all five pages and the shared prefs hook; no 100vh, bottom
  pad or page-owned header; every chart and every category on the page; the
  calendar's 44px grid and its Show All button; the back gesture on every
  sheet; the 12px floor with 16px inputs and the uncapped downs list; no rail
  and only 900/768/600; the tutorial and its targets; the budget row and
  `CONVERTED`.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: phase 11 declared (the five pages,
  the new CSS and the five Toke components) and appended to
  `CONVERTED = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11]`.
- `__tests__/poker-tools-mobile-upgrades.test.mjs`: its `CONVERTED`
  assertion pinned the whole list, so it pinned phase 11 out of existence.
  It now asserts the first nine entries, which is what that test is about.
- `__tests__/page-tutorials.test.mjs`: phase 11 in `LANDED`, with the four
  rooms as `also` so every target is checked against the page it lives on.
- `scripts/ci/mobile-budget.json`: `/hub/toke-tracker` added as
  `converted: true`, 900KB / 2500ms.
- Training surface inventory regenerated.
