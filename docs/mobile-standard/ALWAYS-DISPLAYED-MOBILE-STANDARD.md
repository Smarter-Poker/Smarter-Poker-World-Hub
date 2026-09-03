# The "Always Displayed" Mobile Standard (World Hub)

Written 2026-09-03 from a deep dive of the Social Media pages (the gold
standard, `.agent/skills/mobile-layout-standard/SKILL.md`), the PRs that
built them (#740-#776, #992), and Club Arena
(`CLUB-ARENA-LAYOUT-STANDARD.md` beside this file). It is the source of
truth for the ten-phase rollout in `ROLLOUT-PLAN.md`.

## Dan's rule, in one sentence

Everything is laid out, everything always displays, there is no
"slide to see". Mobile-first, 375px first, then scale up.

Dan verbatim, 2026-08-24 (Club Arena): "FAVORITES AND THE UP/DOWN ARROW
ARE CUT OFF AND YOU NEED TO SLIDE TO SEE THEM." A control that only appears
after a swipe is a hidden control, and a hidden control is a defect.

## What that means in code

1. NO horizontal scroll rails. Every `overflow-x: auto` strip of chips,
   pills, tabs, cards, filters, or "continue watching" tiles becomes either
   a wrapping row (`flex-wrap: wrap`) or a grid
   (`repeat(auto-fill, minmax(Npx, 1fr))`) or a locked row
   (`calc((100vw - gutters) / n)`, PR #740). Delete `scroll-snap-type`,
   `scroll-snap-align`, `flex: 0 0 Npx`, `scrollbar-width: none`,
   `::-webkit-scrollbar { display: none }` and `mask-image` fade hints.
   The grep that finds every violator: `scrollbar-width: none`.
2. NO hidden-content tabs. A tab bar whose panels unmount everything except
   the active one is "slide to see" with extra steps. Sections render
   stacked in document order, each under its own heading. The old tab row
   may stay as an in-page anchor jump list (it scrolls, it does not hide).
3. NO swipe navigation. Touch gestures never change a tab, a section, a
   page, or a table (Club Arena law: never auto-change tables).
4. NO `display: none` content culls at small widths. If a label, kicker,
   rail, sidebar widget, or table column does not fit, it changes shape
   (a row becomes a card, a column becomes a labelled well). It does not
   disappear. The only sanctioned `display:none` is a desktop-only
   duplicate of something the phone shows another way.
5. Tables that do not fit 375px become stacked cards on phones, one record
   per card, with the column header as the label. Never a sideways scroll.
6. NO hover-only affordances (Club Arena: "Remove hover entirely,
   everywhere."). `:active` for press feedback, `:focus-visible` for
   keyboard. Active state is never colour-only (3px indicator bar or icon
   change, `BottomNavBar.jsx`).

## The page shell (copy exactly)

```
<PageTransition>
  <SEOHead />
  <div style={{ minHeight:'100dvh', width:'100%', maxWidth:'100vw',
                overflowX:'hidden', boxSizing:'border-box', background:… }}>
    <UniversalHeader pageDepth={1} onMenuClick={…} />
    <main className="X-page-container" style={{ padding:0, width:'100%', maxWidth:'100%', overflowX:'hidden' }}>
      <div className="X-feed-layout">      /* flex, gap 16, justify center */
        <div className="X-feed-column">    /* flex 1, minWidth 0, max-width 680 (or 960 for tools) */
          …sections, stacked…
        </div>
        <aside className="X-contacts-sidebar" />   /* optional, 220px, desktop only */
      </div>
    </main>
  </div>
</PageTransition>
```

- NO `paddingBottom: 70`. NO `<BottomNavBar>`. NO `BOTTOM_NAV_CLEARANCE`
  import. `pages/_app.js` owns the footer; add the route to
  `src/config/bottom-nav-routes.json` and bump the count in
  `__tests__/bottom-nav-clearance.test.mjs`. (PR #766 + #992.)
- Reachable through `FullScreenPageOverlay`? Add the `isInIframe` guard
  around page-owned chrome (PR #776).
- Fixed overlays render at z >= 900. Header is 100, bottom nav is 90,
  sticky sub-bars <= 50. Verify sticky `top:` against the real rendered
  header height at 375px, not a hardcoded 56.

## Breakpoints

Three, and only three: `900px` (side rail disappears), `768px` (edge to
edge, gaps and padding to 0, grids to one column, global 44px rule),
`600px` (modals become bottom sheets). Do not add a fourth. Prefer
`repeat(auto-fill, minmax(280px, 1fr))` grids that need no breakpoint at
all.

The mandatory block, rendered OUTSIDE any conditional, never inside
`<Head>`:

```css
.X-feed-column { max-width: 680px; overflow-x: hidden; overflow-x: clip; }
.X-contacts-sidebar { width: 220px; flex-shrink: 0; }
@media (max-width: 768px) {
  .X-feed-column { max-width: 100% !important; width: 100% !important; }
  .X-feed-layout { gap: 0 !important; width: 100% !important; padding: 0 !important; }
  .X-page-container { padding: 0 !important; width: 100% !important; max-width: 100vw !important; }
  div[style*="grid-template-columns: 1fr 320px"] { grid-template-columns: 1fr !important; }
}
@media (max-width: 900px) { .X-contacts-sidebar { display: none; } }
```

## Tokens

- Spacing `S = { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32 }`, radius
  `R = { sm:2, md:4, lg:6, sheet:'8px 8px 0 0', pill:999 }`, type
  `F = { h1:22, h2:18, h3:16, body:15, bodySm:14, label:13, caption:12, input:16 }`
  from `src/components/sandbox/paTokens.js`. "Do not invent tokens."
- Mobile scale (<=768): page title 18, body 13-14, button 13,
  button padding `8px 16px`, content padding 12, card gap 8.
- Colours from `SOCIAL_COLORS` (`src/lib/socialHelpers.js`) or the page's
  `body.world-*` variables. No new hexes.
- Touch: `min-height: 44px` on every control (global at <=768,
  `src/index.css:404`), `.sp-icon-btn` for square/circular controls sized
  44x44 explicitly, inputs exactly 16px (no iOS zoom), nothing under 12px,
  `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`.
- Full-height containers use `100dvh`, never `100vh` (PR #740).

## Loading

- One `.X-skel` class + one shimmer keyframe; the skeleton mirrors the
  real layout.
- 8-second failsafe on every initial load
  (`setTimeout(() => setLoading(false), 8000)`, cleared in `finally`).
- Background refreshes never flash the skeleton (`isInitialLoadRef`).
- Realtime inserts show an "N new" pill; they never wipe and reset scroll.

## Hydration

Layout is CSS only. No `isMobile` state, no `matchMedia`, no
`window.innerWidth` deciding what renders (hydration mismatch #418 crashed
bankroll-manager and 13 other pages). If a component truly cannot SSR,
`dynamic(() => import(...), { ssr: false })` with a skeleton loader.

## Two build-failing laws

- `overflow-x: hidden` alone in any `.css` file fails
  `__tests__/fixed-elements-stay-fixed.test.mjs`. Pair it with
  `overflow-x: clip` or declare `overflow-y`. (WebKit re-parents
  `position:fixed` children of an accidental scroller; Dan reported the
  footer floating three times in six days.)
- A page that mounts `<BottomNavBar>` or imports `BOTTOM_NAV_CLEARANCE`
  fails `__tests__/bottom-nav-clearance.test.mjs`.

## Popups

Every toast/popup: First Letter Of Every Word Capitalized, no em dashes
(U+2014, the "em bars" rule, a COPY rule, nothing to do with hamburger
artwork), through the Toast layer, deduped, nothing auto-closes.

## Definition of done for a phase

1. `grep -n "scrollbar-width: none\|scroll-snap\|overflowX: 'auto'\|overflow-x: auto"` on the page and its CSS returns only sanctioned lines (documented in the phase changelog).
2. No `activeTab`/`activeSection` gate unmounts content on phones.
3. No touch handler changes navigation.
4. `node --test __tests__/bottom-nav-clearance.test.mjs __tests__/fixed-elements-stay-fixed.test.mjs __tests__/global-header-approved.test.mjs` green.
5. `npx next build` exit 0.
6. LOOKED AT THE PIXELS at 375px and 390px. "This is the first change this session where I looked at the pixels before claiming anything, which is what Dan asked for." (PR #772)
7. Changelog under `docs/changelog/YYYY-MM-DD-<slug>.md`.
