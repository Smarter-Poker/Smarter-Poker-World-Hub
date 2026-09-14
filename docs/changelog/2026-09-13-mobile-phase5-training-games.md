# 2026-09-13: Always-Displayed Mobile Standard, Phase 5 (Training Games)

Dan, 2026-09-03: phase 5 of the mobile rollout is Training Games, and every
one of the ten pages gets its own tutorial. Standard:
`docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`; every-phase list:
`ROLLOUT-PLAN.md`.

The largest surface in the programme: `pages/hub/training.js`, 94 subpages
under `pages/hub/training/`, 366 components under `src/components/training/`,
and `src/styles/worlds/training.css` at 5,100 lines. Shipped as one pull
request in two commits: the conversion (part one) and the tutorial, guards
and budget flip (part two).

## 1. No slide to see

- **`[data-pills-row]`** is the highest-leverage rule on the surface. Six
  trainers opt in (preflop-charts, hand-comparison, spot-trainer,
  range-builder, scenario-demo, multiway-preflop), so one definition decided
  whether all six hid their selectors. Below 600px it forced one line,
  scrolled sideways, snapped, and suppressed the scrollbar in all three
  engines. Its own comment said why, and the reason was real: eight positions
  wrapped into four rows of pills and pushed the trainer below the fold. But
  that traded a tall row for a hidden one. It is a wrapping grid now, which
  keeps BOTH: `auto-fit` packs eight pills into two rows of four at 375
  instead of four rows of two.
- **`.sp-cat-chips`** on the hub: the same hidden-scrollbar rail, now a
  wrapping row.
- **GameLane, StudyStreakMap and the UniversalDynamicTable action history:**
  three more, all wrapped.
- Zero occurrences of `scrollbar-width: none`, `scroll-snap-type`,
  `scrollSnapType` or the webkit scrollbar cull across the whole surface.

## 2. Nothing is culled

Five `display: none` rules are layout again: the "Training Control Deck"
eyebrow, the "Ready Status / Table Systems Online" readout (the phone showed
a Start button with no statement of whether the table was up), the coach
phase readout (the one thing that says which phase of the lesson you are in),
the hero plate, and the coach back button's label, which left a bare arrow:
the one control a lost player reaches for. That button was also 38px, and
39px on a phone. It is 44px now. The one `display: none` left is inside
`@media print`.

## 3. The 12px floor

`/hub/training` rendered **866** text nodes under 12px, the worst of the ten
pages by an order of magnitude, and range-builder another 188. Both are 0,
measured in a browser at 375 against a production build. 3,016 declarations
were raised across 400 files, with the tracking, wrapping and container
compensation each dense row needed so nothing overflowed. Three classes a
naive sweep misses were found and fixed: CSS inside JS template literals
(45), one `font-size` inside a quoted inline-HTML string, and aliased size
keys no `fontSize` scan can see. Sixteen 13x13 range grids carry
`data-allow-small`, the same sanctioned exception phase 2 established for
the preflop matrix: 13 cells cannot each be 12px or 44px in 351px.

## 4. 100dvh, clip, breakpoints

104 uses of `100vh` became `100dvh` (on iOS Safari `100vh` is the TALLEST
the viewport ever gets, so the last rows sit under the URL bar). 60 bare
`overflow-x: hidden` became `clip`; one of those, on LevelSelector, had a
`position: fixed` backdrop three lines below it, the exact re-parenting bug
the rule exists for. Fifteen distinct breakpoints (360, 375, 390, 430, 480,
540, 640, 700, 720, 760, 860, 1000, 1020, 1050, 1200) became the sanctioned
900 / 768 / 600 plus one 901 complement, mapped by what each block does
rather than by number. The `training-phase-3-adversarial` pin on the old
760 was MOVED to 768, not loosened.

## 5. Shell and foundation on the hub

`<HubPageShell className="training" maxWidth={1180}>` owns the hub shell.
`useLoadFailsafe` caps a stalled dashboard or progress hook at eight seconds
and every render-time "still loading" read goes through the capped pair.
`requireOnline()` guards starting a drill (it opens a session on the server)
and the pull-to-refresh. `useHaptics` on every drill start. `PullToRefresh`
around the dashboard, disabled while the session setup sheet is open.
`useModalHistory` so Back closes that sheet instead of leaving the route.

## 6. The tutorial

`src/tutorials/training.js`: eight Title Case steps (Welcome To Training,
Your Next Drill, The Priority Leak, This Week At A Glance, Lifetime
Progress, The Training Library, Game Cards, Where To Find This Again), no em
dashes, registered as a PREFIX row for `/hub/training` so the hub and all 94
subpages offer it. Targets on the hub: `hero`, `leak`, `stats`, `progress`,
`library`, `search`, `categories`, `games`. The leak step names `stats` as
its alternative because the leak card only renders when a leak has actually
been detected: the section never invents one.

## 7. Tests, laws, budget

- `__tests__/training-mobile-upgrades.test.mjs` (new, 8 tests): the
  foundation imports, the capped loading pair, the wrapping pills row and no
  rail anywhere, no cull outside print, the three breakpoints and no bare
  `overflow-x: hidden`, the 12px floor read as a number (with the range-grid
  exemption), the tutorial with its targets, and the budget row.
- Imported by `__tests__/_test-guards-exist.test.mjs` (CHECK 8).
- `__tests__/no-slide-to-see.law.test.mjs`: `CONVERTED = [1, 2, 3, 4, 5]`.
- `__tests__/page-tutorials.test.mjs`: phase 5 in `LANDED`.
- `scripts/ci/mobile-budget.json`: `/hub/training` flipped to
  `converted: true`, LCP budget 3500 to 2500ms.
- `.agent/audits/2026-08-31-training-phase-2-inventory.json` regenerated:
  the new tutorial file joined the Training dependency graph.
