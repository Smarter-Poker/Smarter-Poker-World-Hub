# 2026-09-03: Mobile Phase 1b, Bankroll Manager on the full foundation

Phase 1 (2026-09-03, earlier today) converted the Bankroll Manager's nav to a
two-column grid and its analytics slider to a stacked grid. Phase 0a then
shipped the shared foundation (`HubPageShell`, `useLoadFailsafe`,
`useModalHistory`, `useHaptics`, `useOnlineStatus`, `ResponsiveTable`) and
phase 0b the full-screen popup rule. This phase re-does the Bankroll Manager
on top of every one of those, numbered as in the brief.

Standard: `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`.
Pins: `__tests__/bankroll-mobile-upgrades.test.mjs`.

## 1. Shell

`pages/hub/bankroll-manager.js` renders
`<HubPageShell className="bankroll" maxWidth={960} background="#18191a" onMenuClick=...>`.
The page's own `UniversalHeader` import is gone (the shell owns the header
and the `isInIframe` guard). The `.bankroll-page` div survives INSIDE the
shell's feed column because `src/styles/worlds/bankroll.css` scopes every
rule under it; it no longer carries `minHeight: 100dvh`, `maxWidth: 100vw`
or `overflowX` (the shell owns those). The `bgGrid` fixed layer is kept (the
column uses `overflow-x: clip`, so fixed descendants stay welded to the
viewport). The sidebar / main flex layout and the phase 1 two-column phone
nav are unchanged. `mainLayout.minHeight` was the last `100vh` on the page;
it is `100dvh` now.

## 2. Loading

- `useLoadFailsafe(isLoading, setIsLoading)`: a hung Supabase call clears the
  skeleton after 8s.
- `useInitialLoadRef()`: `loadData` only sets `isLoading(true)` on the first
  run. Realtime reloads (`rtTimerRef`), mutation reloads, filter changes and
  auth refreshes keep the content on screen, so `LedgerTimeline` never
  swaps to its loading state and scroll position survives.
- New `hasLoadedOnce` state gates a first-paint skeleton that mirrors the
  dashboard: two stat blocks, one chart block, three analytics cards. One
  class (`.bankroll-skel`) and one keyframe (`bankrollShimmer`) in
  bankroll.css, with `prefers-reduced-motion` honoured.

## 3. Modals on phones

All of these are CSS-only, in the ONE sanctioned 600px block in bankroll.css.
Each modal carries `bankroll-modal-overlay`, `bankroll-modal`,
`bankroll-modal-header`, `bankroll-modal-close`, `bankroll-modal-body`, and
(where it has a primary action) `bankroll-modal-footer`, plus a
`bankroll-sheet-handle` drag bar that is hidden above 600px.

At or below 600px: `align-items: flex-end`, `width: 100%`,
`max-height: 92dvh`, `border-radius: 16px 16px 0 0`,
`padding-bottom: env(safe-area-inset-bottom)`, visible handle, and a 44x44 X
top right (the sheet never reaches the status bar at 92dvh; a
`bankroll-modal--full` variant pads the header by
`calc(env(safe-area-inset-top) + 12px)` for any future full-height sheet).
Inputs are exactly 16px (`.bankroll-modal input/select/textarea`) and the
primary action sits in a `position: sticky; bottom: 0` footer inside the
scrolling body.

| Modal | Edits |
| --- | --- |
| `LogEntryModal.jsx` (1,734 lines, wrapper-level only) | `useModalHistory`, sheet classes, handle, 44px `aria-label="Close"`, sticky footer (`styles.actions`, own background, content padding moved to the footer so it sits flush at the sheet bottom), `maxHeight: 90dvh`, `paddingBottom: env(safe-area-inset-bottom)`, all 14 `type="number"` inputs gain `inputMode="decimal"`, input/select/textarea 16px |
| `StartingBankrollModal.jsx` | Same treatment; gained a header row with a 44px X (it had no close control), `inputMode="decimal"`, 44px presets, 48px submit, toast copy Title Case |
| `AdjustBankrollModal.jsx` | Same; header row + X, footer sticky, the Unicode minus in "Withdraw" replaced with a hyphen, toast copy Title Case, no emoji |
| `ManageVenuesModal.jsx` | Same; 44px X, 44px Edit / Del / Save / Cancel / Delete, 16px edit input, toast copy Title Case |
| `BankrollProjection.jsx` | Same; body wrapper, 44px X, `inputMode="decimal"`, 44px period buttons, 48px Run |
| Scanner modal (page) | `closeScanner` callback, sheet classes, 44px X, body scroller, `90dvh` |
| Recent Activity modal (page) | Sheet classes, 44px X, `80dvh`, safe-area padding |
| Sign-in prompt, rule-violation popup (page) | `useModalHistory` at page level; 44px buttons |

Back gesture: the four component modals mount only while open, so they call
`useModalHistory(true, onClose)` and pop their own history entry on unmount
if an X-close left it on top (a back press after an X-close therefore does
not fire a dead pop). Page-owned overlays (scanner, Recent Activity, sign-in
prompt, rule violations, tutorial) call `useModalHistory(isOpen, close)`
where the state lives.

## 4. Touch

bankroll.css: every `button` and `[role="button"]` under `.bankroll-page`,
`.bankroll-modal` and `.bankroll-tutorial` is `min-height: 44px`,
`touch-action: manipulation`, transparent tap highlight, at every width.
`.sp-icon-btn` (src/index.css) pins width/height to `--sp-btn-size` (32px
default); `.bankroll-modal-close` sets the token to 44px. The stat cards are
`role="button"` with keyboard handling. `haptic('light')` fires on every
nav-grid tap, Add +, Tutorial, Adjust Bankroll, banner taps, View All,
Manage Venues, Export Data, Upgrade To VIP, and the tutorial's Back / Next /
Skip. No new `:hover` anywhere; bankroll.css already uses `:active`.

## 5. Tables

`TaxSummaryModal.jsx` (Income By Venue, Deductible Expenses) and
`VenueIntelligence.jsx` (Game Type Profitability, Tournament Buy-In Analysis)
now render `<ResponsiveTable>`: a real table above 768px, one labelled card
per row at or below. `DealerVault.jsx` was named in the brief but contains
no `<table>`; nothing to convert. `grep -l "<table" src/components/bankroll`
returns nothing.

## 6. Text

`perl -pi -e 's/fontSize: (?:[0-9]|1[01])\b/fontSize: 12/g'` across the page,
every `src/components/bankroll/*.jsx` and `metalStyles.js`: 64 occurrences
raised to 12 (AdvancedTaxReport, DealerVault, ReceiptScanner,
SocialStakingProfile, TaxSummaryModal, TokeCalendar, TokeDashboard,
TokeTracker, TournamentCalendar, VenueIntelligence, metalStyles). Page title
is 18px on phones (`.bankroll-page-title` in the 768 block, measured 18px at
375 and 390, 24px at 1280). Pinned by the test.

## 7. Back button / persistence

`goToSection(id)` sets the persisted `activeSection` AND pushes a shallow
`?view=<id>` (bare URL for the dashboard). The existing deep-link effect
reads `router.query.view` as before; when the URL has no `view` and no
`type` and this session has pushed a view before (`sectionPushedRef`), the
back gesture landing on the bare URL means the dashboard. A first visit
with a persisted non-dashboard section and a bare URL writes the section
into the URL once (`router.replace`), so state and address agree from the
start and a persisted section is never overridden. `?view=log-session` and
`?type=` are untouched. Every user-driven section change (sidebar, banners,
Settings > Export Data, Category Overview back) goes through `goToSection`.

## 8. Tutorial

`src/components/bankroll/BankrollTutorial.jsx`, seven steps (Welcome, Your
Balance And Net, Log A Session, The Trend Chart And Filters, Analytics, The
Section Grid, Where To Get Help), each with a title, one to three Title Case
sentences and an optional `data-tutorial` target. Targets on the real
elements: `stats`, `add-button`, `chart` (chart + filters), `analytics`,
`nav`, `insights`. A missing target shows the step without a spotlight. The
ring is a fixed element at z 951 whose 9999px box-shadow darkens everything
except the target; the scrim (z 950) goes clear while a target exists. The
target is scrolled to centre and, on phones, nudged above the sheet. Back /
Next / Skip / X are 44px, seven progress dots, no auto-advance, Escape
closes, `useModalHistory(open, close)`. Desktop: centred card, placed below
a target in the upper half and above one in the lower half so it never
covers what it is pointing at (the only measured overlap is the 666px
desktop nav column vs a 900px viewport, where no placement fits). Phone:
bottom sheet. Seen flag `bankroll_tutorial_seen_v1` in localStorage, try /
catch, SSR-safe (`hasSeenBankrollTutorial()` returns true on the server).
Launches 800ms after the first successful `loadData`; an always-visible
"Tutorial" button beside Add + replays it. The `useLayoutEffect` is the
SSR-silent isomorphic variant (the dev server warned on the first run).

## 9. Perf

Eager: `BankrollTrendChart`, `JarvisLeakInsights`, `BankrollRulesCard`,
`BankrollGoals`, `BankrollProGate`, `ManageVenuesModal`, `StatCard`,
`BankrollTutorial`. Lazy via
`dynamic(loader, { ssr: false, loading: () => <div className="bankroll-skel" style={{ height: 300 }} /> })`:
LedgerTimeline, LocationAnalytics, VarianceCalculator,
HistoricalComparison, TripTracker, SeriesTracker, PlayerNotes,
StakingTracker, TaxReportPanel, AdvancedTaxReport, SocialStakingProfile,
TournamentCalendar, TokeTracker, SavedReceipts, ReceiptScanner,
BankrollProjection, CategoryOverview, SessionHandReview (LogEntryModal and
StartingBankrollModal were already dynamic). `grep -n "from 'recharts'"
pages/hub/bankroll-manager.js` returns nothing; Recharts enters only through
`BankrollTrendChart`'s own `dynamic()` calls.

## 10. Offline

`useOnlineStatus()` plus `requireOnline()`: Add + (and the `?view=log-session`
deep link, which shares `handleLogClick`), delete entry, Adjust Bankroll
(sidebar and stat card), Scan Receipt, attach-receipt, and the three export
buttons show the toast "You Are Offline. Try Again When Connected." through
the existing toast store instead of firing.

## 11. CSS hygiene

The 768 block is untouched. The new 600 block holds only sheet and tutorial
rules. No new `overflow-x` declaration anywhere;
`__tests__/fixed-elements-stay-fixed.test.mjs` is green. Every em dash in
the page, bankroll.css and the touched components (all in comments) became a
hyphen; the new files have none. No emoji in any touched file (three
pre-existing ones removed from the page: the countdown clock, the crown, the
geofence pin).

## 12. Tests and verification

- `node --test __tests__/bankroll-mobile-upgrades.test.mjs
  __tests__/no-slide-to-see.law.test.mjs
  __tests__/overlays-leave-room-to-close.law.test.mjs
  __tests__/fixed-elements-stay-fixed.test.mjs
  __tests__/mobile-foundation.test.mjs __tests__/bottom-nav-clearance.test.mjs`:
  32 pass, 0 fail. `no-slide-to-see` scans `src/components/bankroll` and
  stays green with the new file.
- `@babel/parser` (plugins `['jsx']`) parses the page, every file in
  `src/components/bankroll`, and the new test.
- Playwright against `next dev -p 3458`, storage state from
  `playwright/.auth/user.json` rewritten to `http://localhost:3458`,
  tutorial flag cleared first:

| Viewport | scrollWidth / innerWidth | `[data-tutorial]` | Tutorial opened | Page errors |
| --- | --- | --- | --- | --- |
| 375x812 (isMobile, hasTouch) | 375 / 375 | 6 | yes, "Welcome To Your Bankroll Manager" | none |
| 390x844 (isMobile, hasTouch) | 390 / 390 | 6 | yes | none |
| 1280x900 | 1280 / 1280 | 6 | yes | none |

  (Six targets: the Welcome step has none by design.)

  Header row at 375: title 18px; Tutorial button 86x46; Add + 73x44.

  Add + sheet at 375: `.bankroll-modal` top 400, width 375 (full width),
  computed radius `16px / 0px` (rounded top, square bottom), max-height
  747px (= 92dvh), drag handle visible, close control top 428 (>= 12) and
  44x44. After tapping Cash Games: every input / select 16px, three
  `inputmode="decimal"` inputs, footer `position: sticky` with bottom 812 =
  sheet bottom (flush, above the keyboard-safe area).

  Tutorial walked all seven steps at 375 and 1280: ring drawn on every
  targeted step, card never overlapping the ring at 375; at 1280 only step
  6 (the 666px nav column) overlaps; Done closes and writes
  `bankroll_tutorial_seen_v1 = "1"`.

  Screenshots (full page, viewport, sheet, form, tutorial step 2, tutorial
  step 6) in `~/Documents/Smarter-Poker-World-Hub/.phase1b-shots/`, with
  `small-*` copies downscaled to <= 1600px via `sips -Z 1600`. Looked at:
  nothing wider than the viewport, the nav grid and Jarvis card stacked
  above the header row, stats / chart / filters / analytics / recent
  activity stacked, the sheet with handle and X, the spotlight ring on the
  stat cards with the card beneath it.

- Dev server killed after the run; `.shot.mjs` and the temporary
  `.env` symlinks removed from the worktree.

## Not done / notes

- Fonts in the dev screenshots render in the body serif because Inter is
  not loaded in this dev setup; the modals and tutorial now declare the same
  `Inter, -apple-system, ...` stack as the page so they match in production.
- The tutorial X sits at `top: 12px` inside the card rather than at
  `env(safe-area-inset-top)`; the card is never full-height (80dvh sheet on
  phones, centred on desktop), so it cannot sit under the status bar.
- `DealerVault.jsx` has no table to convert (see 5).
- `TokeTracker.jsx`'s own inline modals were fixed in phase 0b and are
  outside this page's render tree (the toke-tracker route); not re-touched
  beyond the 12px floor.
