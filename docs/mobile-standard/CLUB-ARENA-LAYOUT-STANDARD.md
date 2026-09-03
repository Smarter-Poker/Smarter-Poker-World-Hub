# Club Arena - Mobile Layout Standard (non-table surfaces)

Scope: every Club Arena route EXCEPT the live felt (`/table/*`, `/tournaments/:id/play`)
and the multi-table page, which have their own laws.

Derived from the club-arena repo as of 2026-09-03; every rule below names the file
or law test it comes from.

---

## 0. The one rule everything else serves

**CLAUDE.md s10 rule 6 (Dan, binding): "Mobile-first. 375px first, then scale up."**

CI verifies ~110 routes at **390 and 360 px** with an iPhone UA
(`scripts/e2e-mobile-overflow-audit.mjs`), flagging any element whose rect crosses
the viewport edge. 360 is the floor; 375 is the design target.
`index.html` sets `viewport-fit=cover`, which is why every safe-area rule exists.

---

## 1. The page shell stack (top to bottom)

Rendered by `AppLayout.tsx` inside `.layout` (`display:flex; flex-direction:column;
min-height:100vh; min-height:100dvh; background:#000`).

| Order | Element | Positioning | Notes |
|---|---|---|---|
| 1 | `GlobalHeader` | `position: sticky; top:0; z-index:390` | Hidden only on table/play routes |
| 2 | `.pinnedActionBarClearance` | in flow, zero height | Expands to `--mtt-ticker-h`, or `--ca-pinned-bar-offset` (48px) while `body[data-ca-pinned-bar='1']` |
| 3-5 | `ClubAnnouncementBanner`, `ArenaSectionRail`, `ClubOperationsRail` | in flow | conditional; the rails are horizontal, ops rail is club-staff only |
| 6 | `<main id="main-content" tabIndex={-1}>` | `flex:1` | focused on each SPA navigation |
| 7 | `ClubBottomNav` | `position: fixed; inset: auto 0 0 0; z-index:1000` | the "footer"; artwork-driven, 6 cells |

**Header.** One approved raster (`global-header-desktop.png`, 1648x168) at
`aspect-ratio:1648/168` on mobile; above 901px a fixed `96px` band with
`object-fit: fill`. Controls are **transparent absolute hit regions in percent** over
the artwork, all at `top:13%; height:74%` (left/width): hamburger `1.7/7`, back
`8/12`, hub `19.1/12.9`, profile `66.75/7.15`, wallet `73.2/7.1`, VIP `79.9/6.5`,
messenger `86/6.9`, notifications `92.3/6.2`.
- `.header { background: transparent }` (Dan 2026-09-01: "on mobile, the global
  header needs the background removed on all pages"), and `.header::before` paints
  ONLY the `env(safe-area-inset-top)` band solid `#000` (Dan 2026-09-02: "THE HEADER
  MUST ALWAYS BE AT THE TOP, AND NOTHING SHOULD EVER APPEAR, OR BE DISPLAYED ABOVE IT
  IN THE PADDING AREA ABOVE IT. THAT SHOULD BE BLACK AND NEVER SHOW ANYTHING ABOVE
  IT."). PWA mode uses `max(env(safe-area-inset-top), 24px)` for both.
- **No boxes over header icons** (Dan 2026-09-01, binding): no outline, no
  box-shadow; keyboard focus is a soft radial glow. `:active { opacity:.76 }`.
- The header is **sticky, not fixed**, so it already occupies flow space. Never add a
  `padding-top` reservation for it - that is the black band Dan photographed 2026-08-27.

**Hamburger.** The hamburger IS the menu, on every trigger (CLAUDE.md 10.7). "em
bars" = em dashes (U+2014), a COPY rule; misreading it as artwork has twice deleted
the menu (#2321, #2429). `approvedHamburgerGearGuard.law.test.ts` pins the sha256 of
six rasters and four triggers with their aria-labels (GlobalHeader and
FloatingHamburger "Open Menu", Shell "Menu", TableMenu "Table Menu"); gear, settings
and command-grid substitutions are forbidden by name.

**Bottom nav (the footer).** Six full-cell targets over one approved webp
(`club-arena-footer.webp`, 1916x256) overscanned to `102.68%` width to cancel its
25px built-in edge gutters. Grid columns are the artwork's own proportions:
`21.1fr 15.7fr 15.1fr 14.9fr 14.1fr 19.1fr`. Cells in order:
`Settings, Players, Cashier, Market, Data, Stats`. Labels are `.visuallyHidden`
spans + `aria-label`; any visible label must stay short - "Msgs" not "Messages"
(CLAUDE.md s9). Active state is `aria-current="page"`, never a painted box: **no
boxes over footer icons** (Dan 2026-09-01, binding). The nav declares
`transform/translate/transition/animation: none`, `contain: none`,
`min-height: var(--bottom-nav-height)` and `padding-bottom: env(safe-area-inset-bottom)`,
all pinned by `tests/footer-stays-on-the-footer.law.test.ts`.

A second, older chrome exists (`Shell.tsx`/`.css`). New non-table work belongs in
`AppLayout` + `GlobalHeader` + `ClubBottomNav`; do not add surfaces to Shell.

---

## 2. Breakpoints

There is no single scale. These decide layout; do not invent new ones.

| Query | Owner | What changes |
|---|---|---|
| `max-width: 600px` | `AppLayout.module.css .main` | shell padding `--space-3` (12px), `padding-top: 4px`, `overflow-x: hidden; overflow-x: clip` |
| `max-width: 1024px` | `AppLayout.module.css .main` | shell padding `--space-4` (16px) |
| `max-width: 900px` | `LobbyTable.css`, `GlobalHeader` badges | table rows become cards; mobile sort bar appears; header badge shrinks to `clamp(12px,1.7vw,18px)` |
| `min-width: 641px` (inside the 900 block) | `LobbyTable.css` | cards go two-up on a tablet |
| `min-width: 901px` | `GlobalHeader.module.css` | desktop 96px header band |
| `max-width: 768px` / `480px` | `ClubHomePage.css` | club art 64px / 56px, name 0.86rem |

Default page padding: **12px below 600, 16px to 1024, 32px/24px above**, plus
`padding-bottom: max(<that>, var(--bottom-nav-clearance, 86px))` on every one.
Content column caps at `max-width:1400px; margin:0 auto`. `.main.mainFlush`
(notifications, club lobby) zeroes padding and max-width and becomes a flex column so
a full-bleed page sits flush under the header (Dan 2026-08-27: "IT NEEDS TO BE RAISED
UP TO THE TOP TO BE ATTACHED TO THE GLOBAL HEADER.").

**Do not add breakpoints to a component that only needs to be smaller.** See s6.

---

## 3. Tokens with exact values

Two token sheets are loaded and they DISAGREE. Know which you are inheriting.

**Layout (identical in both `design-system.css` and `globals.css`):**
```
--header-height:        56px            (informational; the header is proportional)
--bottom-nav-height:    clamp(44px, 13.72vw, 132px)
--bottom-nav-clearance: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))
--bottom-nav-stack-base:same expression - anchor a stacked fixed bar on THIS
--sidebar-width:        280px
--max-width-mobile: 480px  --max-width-tablet: 768px  --max-width-desktop: 1200px
```
At 375px, `13.72vw = 51.5px`, so the drawn footer is ~52px plus the home indicator.

**Spacing (both):** `--space-1..-12` = 4, 8, 12, 16, 20, 24, 32, 40, 48px
(globals adds `--space-16` 64px).

**Radius (identical):** `sm 4px, md 8px, lg 12px, xl 16px, 2xl 24px, full 9999px`.

**Type - two scales, do not mix in one component:**
- `design-system.css`: `--fs-xs .6875rem(11px)` `--fs-sm .75rem` `--fs-base
  .875rem(14px)` `--fs-md 1rem` `--fs-lg 1.125rem` `--fs-xl 1.25rem` `--fs-2xl
  1.5rem` `--fs-3xl 2rem`; weights 400/500/600/700; body 14px/1.5.
- `globals.css`: `--text-xs .75rem` ... `--text-5xl 3rem`; body 16px/1.6; raw `h1`
  is 3rem, far too large at 375px - give headings an explicit page size.
- Fonts: `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
  chrome/rails `'Rajdhani','Roboto Condensed', system-ui`; numerals `'tnum'`.

**Colour:**
```
page/shell black   #000  (layout, casinoStage, bottom nav, header safe-area band)
surfaces  --bg-primary #18191a  --bg-secondary #242526  --bg-tertiary #3a3b3c
          --bg-elevated #303132  --bg-card rgba(36,37,38,.95)
blue      --fb-blue #1877f2  hover #166fe5  light #4599ff  dark #0d5dc7
          chrome/rail accent #75beff, glow rgba(76,170,250,.7)
text      #e4e6eb / #b0b3b8 / #8a8d91 / #606770  (globals: #fff / rgba(255,255,255,.7/.5/.3))
gold      #ffd700 -> #b8860b (135deg gradient)
status    green #31a24c (globals #3fb950), orange #f7931a, red #f02849,
          purple #8b5cf6, badge red #d91136
borders   rgba(255,255,255,.1/.2/.3)  (globals: .08/.15)
shadows   sm 0 1px 2px rgba(0,0,0,.3) | md 0 4px 8px rgba(0,0,0,.4)
          lg 0 8px 24px rgba(0,0,0,.5) | glow 0 0 20px rgba(24,119,242,.3)
z-index   tokens: dropdown 100, sticky 200, overlay 300, modal 400, toast 500
          actual chrome: header 390, table action bar 380, bottom nav 1000,
          toast container 10000, skip link 10000
motion    fast 150ms, base 200-300ms, slow 300-500ms,
          spring cubic-bezier(.34,1.56,.64,1), ease-out cubic-bezier(.16,1,.3,1)
```
Backgrounds behind the shell are **solid black, one colour** (Dan 2026-08-30:
"NOTICE THE BACKGROUND OF THE CLUB ARENA. ITS NOT ALL THE SAME COLOR AND YOU CAN
SEE SOME OLD BORDER IMAGES ON THE SIDES. THE WHOLE BACKGROUND SHOULD BE SOLID
BLACK AND ALL THE SAME COLOR."). No route art, no photo washes, no inset edge
highlights on the stage.

---

## 4. Touch targets and interaction

- **44x44 CSS px minimum** for anything tappable: `.navItem` and both rails' `.item`
  declare it. Where the visible control is smaller (a 32px chip), the row's padding
  makes up the difference (`.lobby-sortbar__chip`: 32px inside 8px/6px padding).
- Where a 44px target would distort artwork, use an **invisible `::after` band** - the
  only thing allowed to carry a pixel size, "because it paints nothing and therefore
  cannot move anything".
- **NO HOVER, ANYWHERE** (Dan 2026-08-29, binding: "Remove hover entirely,
  everywhere." - `tests/no-hover-effects.law.test.ts`). No colour, background,
  border, shadow, filter, opacity or z-index change on `:hover`. Press feedback is
  `:active`; `:focus-visible` stays and is load-bearing. `@media (hover: none) and
  (pointer: coarse)` is a capability query and is allowed. A control revealed only
  on hover is invisible on a phone - that shipped three times.
- `-webkit-tap-highlight-color: transparent` and `-webkit-text-size-adjust: 100%` on
  `html` (the latter stops iOS inflating fonts on rotation).
- Focus rings: global `:focus-visible` is `2px solid` blue/gold, `outline-offset:2px`,
  EXCEPT on artwork controls (header, footer), where a radial glow replaces the ring.
- Reduced motion collapses animation to `0.01ms` globally.

---

## 5. Everything displays. No slide-to-see.

Dan, 2026-08-24, verbatim: **"FAVORITES AND THE UP/DOWN ARROW ARE CUT OFF AND YOU
NEED TO SLIDE TO SEE THEM."** The fix note states the doctrine: "a scroller that
always overflows is just a hidden control."

Dan, 2026-08-25, verbatim: **"THE DETAILS PAGE NEEDS TO SHOW EVERYTHING ON ONE
'OVERVIEW' WITHOUT SCROLLING DOWN. THIS PAGE NEEDS TO BE VISUALLY OPTIMIZED AND
BALANCED BETTER."**

Rules that follow:

1. **A list or table that does not fit changes shape, never scrolls sideways.**
   `LobbyTable.css`: "The lobby must FIT, not scroll sideways." `min-width:520px` once
   forced ~225px of sideways scroll at 375px. Below 900px `thead` is hidden,
   `table/tbody/tr` become `block/flex`, and each row is a wrapping card: game name on
   its own line, stakes/seats/status as chips beneath. "Nothing has a fixed width any
   more, so nothing can overflow." No fixed-width cell, no `min-width`, on a phone.
2. **A column shed on a phone is re-shown as a labelled well**, in the priority
   order the wide breakpoints use (that is why the 641-900px band exists).
3. **Anything the desktop puts in a `thead` gets a phone equivalent.** Dan
   2026-09-02, verbatim: "THERE IS NOT FILTERS FOR THE GAME CARDS BELOW, LIKE THERE IS
   ON DESK TOP, YOU NEED TO ADD THAT TO THE BOTTOM, RIGHT BELOW THE DYNAMIC ADD, SO
   MOBILE USERS CAN FILTER AND DISPLAY THE RESULTS ACCORDINGLY." The mobile sort bar
   copies the `thead th` styling exactly, because it IS that control.
4. **Tabs**: all tabs visible at 375px. Use the token `.tabs`/`.tab` pattern (flex,
   `flex:1`, `--fs-sm`, pill `--radius-xl` track, `--fb-blue` active); a strip that
   cannot fit may scroll only under s6.
5. **A panel is never taller than its content, and a dialog must fit.** Shells that
   size to the viewport measure their own chrome with a `ResizeObserver`; `100dvh` is
   wrong (header, banners and `<main>` padding sit above).
6. **Nothing auto-closes** (Dan 2026-08-31, verbatim: "...IT AUTO CLOSES WHEN ACTION
   IS ON YOU AND THAT SHOULDN'T HAPPEN... IT SHOULD NEVER AUTO CLOSE."). A panel
   closes on the X, Escape, or a real backdrop tap. `tests/nothing-auto-closes.law.test.ts`.
7. **Never move the user's view for them.** No auto table switching (Dan: "YOU CAN
   NEVER EVER AUTO CHANGE TABLES FOR A USER, THEY MUST CHANGE IT BY THEM SELF."); by
   extension, never auto-advance a carousel, a tab, or a page.

---

## 6. Horizontal scroll: what is sanctioned

Sideways scroll is the exception and needs a reason. Sanctioned:

- **The club carousel** (`components/carousel/Carousel.tsx` via `CarouselSection`).
  Dan 2026-08-21, verbatim: "a user can join and be a part of unlimited amounts of
  clubs, but the display is limited... the same exact functionality that the World
  Hub page has, with the tiles swiping back and forth in an endless carousel."
  Dan 2026-08-21: "IT NEEDS TO DISPLAY 3 CARDS AT ONCE, AND SNAP TO CENTER ONE CARD
  AT A TIME. NOT ONLY DISPLAY ONE AT A TIME."
  Dan 2026-08-22: "IT SHOULD SHOW 1-3 CARDS ON THE PAGE, WITH THE CARD IN THE MIDDLE
  THE LARGEST."
  Constants: `visibleCards={3}`, `spacingRatio={0.94}`, `edgeScale={0.8}`, phone-derived
  `itemWidth`. It is **not** a scroll container: the old `overflow-x:auto` + scroll-snap
  strip was replaced because it has ends, while the wrapping carousel puts the far end
  one swipe away. A swipe must not also fire the card's 500ms press-and-hold menu.
- **Chip / pill rails that must not wrap**: `.lobby-sortbar__chips`, both rails'
  `.items`, the quick-pref chips - wrapping would push the first card below the fold.
  They must ALSO be sized so the normal set fits without scrolling: the scroller is
  the safety net for an unusual number of items, never the plan.
- **Wide data tables on report/admin pages** (`SettlementPage`, `ClubDataPage`,
  `DataTable`, `SortableTable`): a real tabular financial record may scroll.
- **The MTT ticker / marquee** (`.mtt-ticker`), which moves its own track by
  transform and is excluded from the CI overflow audit by name.

**How to declare one, always:**
```css
overflow-x: auto;
overflow-y: hidden;            /* REQUIRED - see s7 */
overscroll-behavior-inline: contain;
scrollbar-width: none;         /* plus ::-webkit-scrollbar { display:none } if hidden */
-webkit-overflow-scrolling: touch;
```
Everything else fits. `ClubIdentityCard.css` states the component principle:
"THE CARD ONLY SHRINKS. IT NEVER REARRANGES." (Dan 2026-09-01, verbatim: "WHEN YOU
SWITCH TO MOBILE VIEW, IT GETS DISTORTED, COPY ICON MOVES OUT OF ITS FRAME, CLUB AND
PROFILE ICON SHIFT... (IT CAN'T DISTORT, ONLY SHRINK)"). Its four rules generalise:
positions as a percentage of the box; sizes in `cqw` (no `clamp()` with a px/rem
bound - a bound that stops scaling IS a rearrangement); **no breakpoint overrides**;
44px targets as invisible bands.

---

## 7. The overflow-x law (footer stays on the footer)

`tests/footer-stays-on-the-footer.law.test.ts`, binding, scans **every `.css` under
`src/`**.

**Never write a bare `overflow-x: hidden;`.** CSS Overflow 3: when one axis is
non-visible and the other is `visible`, the visible one computes to `auto`, making the
element a scroll container on BOTH axes. WebKit then resolves `position: fixed`
descendants against the nearest scrolling ancestor, so the fixed `ClubBottomNav` is
pinned to the bottom of a 25,000px scroll box and rides up over the content. Chrome
does not do this, so it survives review and only appears on Dan's iPhone.

Dan reported it three times:
- 2026-08-24: **"THE FOOTER NEEDS TO ACTUALLY BE ATTACHED TO THE BOTTOM"**
- 2026-08-25: **"on safari on player accounts, the footer doesn't stay on the footer, it moves around"**
- 2026-08-29: **"THE FOOTER IS COMING UP ON MOBILE AND ISN'T STAYING LOCKED TO THE FOOTER"**

The permitted forms:
```css
overflow-x: hidden;   /* fallback for < Safari 16 / Chrome 90 */
overflow-x: clip;     /* the real rule - `visible` stays `visible` beside `clip` */
```
or an explicit `overflow-y`/`overflow` shorthand, which declares a deliberate
scroller and is exempt. The law also pins `body` in `design-system.css` and
`club-engine.css`, and the bottom nav's fixed geometry.

Also never put `transform`, `filter`, `perspective`, `will-change` or
`contain: paint` on an ancestor of the bottom nav: each creates a containing block
for fixed descendants and reproduces the bug by another route.

---

## 8. Safe areas

- `body` pads by `env(safe-area-inset-left/right/bottom)` under `@supports`.
- Every page reserves `padding-bottom: max(<page padding>, var(--bottom-nav-clearance, 86px))`.
- The header pads `env(safe-area-inset-top)` and blacks that band out; artwork and
  controls are inset by `env(safe-area-inset-left/right)`.
- Stack a second fixed bar on `--bottom-nav-stack-base`, **not** on
  `--bottom-nav-clearance`: the clearance is deliberately generous, so anchoring to it
  floats the bar above the nav on a notched iPhone.

---

## 9. Popups and toasts

CLAUDE.md s5 rule 7 (Dan 2026-08-20, binding), verbatim: **"any and all pop ups need
the first letter of every word capitalized, and forbid the use of em bars."**
"em bars" = **em dashes, U+2014**, a copy rule; it says nothing about artwork.

- Every message goes through the Toast layer, which applies `formatPopupText()`
  (`src/utils/popupStyle.ts`): title case (interior capitals kept, so VIP/BBJ/NLH
  survive and contractions are not split), spaced em/en dash -> `. `, any other -> `-`.
  Never hand-roll a popup and never disable the transform at a call site.
- Identical toasts dedupe while on screen and have a cooldown; do not build retry
  loops that re-toast the same string.
- Default duration 4000ms, exit animation starts at `duration - 300`.
- Container: `position: fixed; bottom:24px; right:24px; z-index:10000;
  max-width:400px; pointer-events:none` (the toast re-enables them). At 375px that
  cap plus insets means toast content must be allowed to shrink; never fix its width.
- Modals and panels obey s5 rule 6: only the player closes them.

---

## 10. Shared with the World Hub, and where Club Arena differs

**Shared**
- One origin, one session: Club Arena is served at `smarter.poker/hub/club-arena/*`
  through a World Hub rewrite, sharing `smarter-poker-auth`. No iframe.
- The popup copy rule (title case, no em dashes) is Dan's platform-wide house rule.
- The endless club carousel is the World Hub's behaviour, its constants lifted from
  the World Hub's engine at Dan's instruction; the hamburger drawer is ported from the
  World Hub and then pinned by law.
- Dark-first palette and the Facebook blue `#1877f2` family.

**Differs**
- Styling model: Club Arena is Vite + React 19 with **CSS Modules + global CSS and
  custom-property tokens**; the World Hub is Next.js (pages router) with Tailwind
  plus page-scoped CSS. Tokens and class names do not cross - do not copy them.
- Breakpoints: Club Arena decides at **600 / 900 / 901 / 1024** (plus 641 inside the
  900 block); the World Hub's page CSS leans on **768 / 400**.
- Chrome: Club Arena has a fixed artwork-driven six-cell bottom nav and an
  artwork-driven header with percentage hit regions. The World Hub has neither, so
  these conventions are Club-Arena-only and must not be "harmonised" by editing art.
- The `overflow-x: clip` law, the no-hover law, the no-boxes-over-icons law and the
  bottom-nav clearance tokens are Club Arena laws with CI enforcement. The World Hub
  is not bound by them today; re-check any component moved between the repos.

---

## 11. Checklist before you push a non-table surface

1. Renders at 375x812; nothing crosses the viewport edge at 360.
2. No bare `overflow-x: hidden` anywhere in the diff.
3. `padding-bottom: max(<page padding>, var(--bottom-nav-clearance, 86px))`.
4. Every tappable thing is >= 44x44, and nothing depends on `:hover`.
5. Every section, tab and control is visible without sliding sideways - or the
   scroller is one of s6's sanctioned cases and declares both axes.
6. Header untouched: sticky, transparent, black safe-area band, no rings on icons.
7. Popups go through the Toast layer; no em dashes; nothing auto-closes.
8. Tokens only - no new hard-coded greys, and one type scale per component.
