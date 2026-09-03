# 2026-09-03: Always-Displayed Mobile Standard, Phase 1 (Bankroll Manager)

Dan, 2026-09-03: review how the social media pages were optimised for
mobile and how Club Arena lays everything out ("everything always
displays, there is no slide-to-see"), write it down, and roll it out to
the rest of the World Hub in ten phases.

## Written down

- `docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md`: the rule
  and the reusable shell/breakpoint/token/loading/hydration checklist,
  distilled from `.agent/skills/mobile-layout-standard/SKILL.md`, PRs
  #740-#776 and #992, and the two build-failing laws.
- `docs/mobile-standard/CLUB-ARENA-LAYOUT-STANDARD.md`: the Club Arena
  side, with every Dan quote found in that repo.
- `docs/mobile-standard/ROLLOUT-PLAN.md`: the ten phases with every
  violating file:line found in the audit.
- `__tests__/no-slide-to-see.law.test.mjs`: bans `scrollbar-width: none`,
  `scroll-snap-type` and `::-webkit-scrollbar { display:none }` in each
  converted phase's files. Phase 1 is converted; each later PR appends
  its phase number to `CONVERTED`.

## Phase 1 changes

`pages/hub/bankroll-manager.js`
- The `.bankroll-mobile-nav` horizontal pill rail (13 items, scrollbar
  hidden, items 5-13 off screen at 375px) is deleted. There is ONE nav,
  `.bankroll-sidebar`, at every width; on phones it is a two-column grid
  of 44px buttons above the content with every section visible. Active
  item carries `aria-current="page"` and a border, not colour alone.
- `.bankroll-analytics-slider` (scroll-snap, 85% cards, two of three
  hidden) is now `.bankroll-analytics-grid`: three across on desktop, one
  column stacked on phones, all three visible.
- Container: `100dvh`; `paddingBottom: 70` removed because `_app.js`
  renders `BottomNavSpacer` for this route (PR #766, #992).

`src/styles/worlds/bankroll.css`
- Mobile block rewritten: sidebar no longer `display:none`; nav grid,
  44px targets, 13px labels, wrapping content header, filter buttons
  44px.
- Hover rules replaced by `:active` press feedback and `:focus-visible`.

`src/components/bankroll/DealerVault.jsx`: tab bar and year filter wrap
instead of scrolling sideways; 44px targets.
`src/components/bankroll/VenueIntelligence.jsx`: four-column tables use
`table-layout: fixed` at 100% width instead of an overflow scroller.

## Interpretation recorded for later phases

"Everything always displays" is applied the way Club Arena applies it: the
navigation and every control is fully visible with nothing behind a swipe,
and no content is culled at small widths. Bankroll Manager's thirteen tools
still open one at a time under that always-visible nav (the same shape as
Club Arena's section rails + main), because rendering thirteen data-loading
workspaces stacked on one 375px page would be a mile of scroll, not
"laid out". If Dan wants the sub-tools literally stacked, that is a
one-line change in the plan and a follow-up PR.

## Verification

- `node --test __tests__/no-slide-to-see.law.test.mjs __tests__/fixed-elements-stay-fixed.test.mjs __tests__/bottom-nav-clearance.test.mjs` green.
- Babel parse of the three JS files clean.
- Pixels checked at 375px on the branch build (see PR).
