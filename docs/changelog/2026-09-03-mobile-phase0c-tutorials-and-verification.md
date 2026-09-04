# 2026-09-03: Phase 0c, page tutorials, verification of Phase 0/1, the last checklist gaps

Dan, 2026-09-03: (1) every one of the ten pages gets a tutorial, hidden by
default in the hamburger menu, offered by a small bottom prompt that
disappears after three seconds; it must not look cheap. (2) Before phase 2,
deep-dive and verify everything built so far is fully built, wired and
tested, fix every bug, gap, stub or wiring issue, and confirm it is pushed
and published.

## 1. The tutorial system (new)

- `src/components/tutorial/PageTutorial.jsx`: the one engine (spotlight ring
  with pulse, step badge, progress bar, dots, Skip / Back / Next / X at
  44px, back gesture closes, Escape closes, bottom sheet on phones with a
  drag handle, centered card on desktop placed off the spotlight). Grew
  out of the Bankroll tour, which is deleted.
- `src/components/tutorial/TutorialPrompt.jsx`: "Would You Like A Tutorial
  Of This Page?", Start and X, the note "Tutorials For Every Page Live In
  The Hamburger Menu If You Ever Need It.", a visible three-second
  countdown bar that pauses while a finger rests on the card.
- `src/components/tutorial/TutorialProvider.jsx`: mounted once in
  `pages/_app.js`; looks the route up, shows the prompt once per page 1.2s
  after arrival, opens the tour on Start, on the hamburger row, or on the
  `sp:open-page-tutorial` event; fires `sp:page-tutorial-will-open` so a
  page can put itself in the state the tour expects.
- `src/tutorials/index.js` (registry, storage helpers, events) and
  `src/tutorials/bankroll-manager.js` (the seven Bankroll steps).
- `src/components/ui/HamburgerMenu.jsx`: "Page Tutorial" row above Log Out
  on every route in the registry.
- `src/styles/tutorial.css`: the design (glass gradient card, accent ring,
  progress, prompt), reduced-motion safe, 600px sheet rule only.
- `pages/hub/bankroll-manager.js`: page-owned tutorial, header Tutorial
  button and auto-launch removed (hidden by default is the rule); listens
  for the will-open event and returns to the unfiltered dashboard.
- `__tests__/page-tutorials.test.mjs`: pins the mount, the hamburger row,
  the exact prompt copy, and for every landed phase that the tour is
  registered, has at least five Title Case steps, and every spotlight
  target exists in the page.

Phases 2 to 10 register their tours in their own PRs, because the spotlight
targets only exist once each page is rebuilt on the always-displayed layout
(`ROLLOUT-PLAN.md`, "Every phase").

## 2. Verification of Phase 0/1 (fixes)

- `useModalHistory` rewritten on a tested core (`src/hooks/modalHistoryCore.js`,
  `__tests__/modal-history-core.test.mjs`, 8 cases): stacked sheets close
  top-first on back, a programmatic close pops exactly one entry and never
  re-fires `onClose`, opening during an in-flight pop is queued, an
  unowned entry after a `/login` push is recovered, and the Next router is
  told via `beforePopState` to ignore modal pops (it was re-running the
  route and scrolling the page to the top on every modal close).
- `src/hooks/useScrimDismiss.js` (new): a scrim closes on a tap that
  STARTED on it, not on a drag-select that ended there. Wired into every
  Bankroll sheet and page overlay.
- `requireOnlineNow(toast)` in `useOnlineStatus.js` for submit handlers
  inside modals with no render-time flag; every Bankroll mutation and
  export is guarded.
- `src/index.css`: `<small>` keeps its 0.83em ratio under the 12px floor
  (the previous `max(12px, 1em)` made every `<small>` the size of its
  parent).
- Sign-in overlay on the Bankroll page raised from z 50 to 1000 (it sat
  under the header and the bottom nav).
- `TokeTracker.jsx` had two `boxShadow` keys in one style object (the
  first silently dropped); merged.
- `pages/hub/social-media/index.js` lightbox got the same safe-area X as
  the four clones (it was skipped in 0b).

## 3. Checklist gaps closed

- Sticky offsets: `UniversalHeader` publishes `--sp-header-height` from its
  rendered height; `--sp-bottom-nav-height` in `global-tokens.css`.
- Pull-to-refresh: `src/components/ui/PullToRefresh.jsx`; Bankroll's whole
  dashboard reloads on pull, disabled while any sheet is open.
- Performance budget in CI: `e2e/mobile-budget.spec.ts` in the Global
  Footer E2E workflow (production build, 375px) with
  `scripts/ci/mobile-budget.json`; Bankroll is `converted: true` (12px and
  44px enforced), the other nine carry generous rows that only go down.
- Text sizing: recorded in the standard; Bankroll's last 36px control
  raised to 44.

## 4. Verification results

- `node --test __tests__/*.mjs`: 8 pre-existing failures in files this
  work does not touch (`api-routes-exist` names `diamond-store.js` and
  `memory-games.js` literals; Club Arena budgets; diamond-store phase 14;
  sidebar records; newsletter admin; Open Claw config; venue integrity;
  training inventory). Everything this programme owns is green.
- `npx tsc --noEmit`: exit 0.
- `npx next build --webpack`: see the PR for the exit code and route sizes.
- Playwright at 375/390/1280: see the PR body.
