# World Hub footers: transparency, Club Arena geometry, and a feed that hides them

**Date:** 2026-09-04
**Branch:** `fix/social-footer-scroll-and-frame`
**Reported by:** Dan, four separate complaints in one session.

---

## 1. "The footer on social media needs to disappear when you scroll up and reappear when you scroll down like it does on facebook. it needs to be real time instant change."

Worlds now opt in with `"hideOnScroll": true` in
`world-footer-navigation.json`; only `social-media` does, and its route family
is the whole social product (`/hub/social-media`, `/hub/reels`,
`/hub/friends`, `/hub/messenger`, `/hub/social-pages`, `/hub/saved-posts`,
`/hub/post`, `/hub/user`, `/u`).

`useHideOnScroll` in `BottomNavBar.jsx` reads scroll direction and applies
`transform: translateY(100%)` — the bar's own height, straight down, nothing
else. **There is no transition, no easing, and no timer**: the transform lands
on the animation frame following the scroll event, which is the frame the
browser was going to paint anyway. "Smooth" is what Dan explicitly ruled out.

Details that stop it feeling broken:

- The threshold (4px) is measured from where the current run of travel in one
  direction **began**, not from the previous event. A single flick flips it
  instantly; sub-pixel jitter inside a momentum scroll cannot rattle it.
- At `scrollY <= 0` the bar is always shown.
- Rubber-band overscroll past the end of the document is not "travelling
  further down" and hides nothing.
- A route change resets it, so arriving at a page from a scrolled one never
  inherits a hidden bar.
- `onFocusCapture` reveals it: keyboard focus has no scroll direction, so
  tabbing into a parked footer would otherwise move focus off-screen.
- The clearance spacer never moves, so no content reflows when the bar goes.

**This narrows an existing law rather than deleting it.**
`__tests__/fixed-elements-stay-fixed.test.mjs` carried
`assert.doesNotMatch(nav, /autoHide|setHidden|addEventListener\('scroll/)`.
That clause was written for a different failure — the bar coming *unstuck*
from the viewport on iOS because an ancestor had quietly become a scroll
container — and every part of that is still pinned. What replaces the blanket
ban is a test that movement is opt-in per world, on one axis, by exactly one
screen height, with no transition or timer, and always reversible.

## 2. "The bottom of the footer seems distorted and pixelated now"

Root cause, measured on production before touching anything: the global
`img, video { max-width: 100% }` reset.

Each footer image is the **whole source canvas**, deliberately sized *larger*
than its stage so the stage can crop the canvas margin away — for social
media, `width: 102.577%` of a stage that is the measured frame. The reset
clamped that width back to 100%, and `object-fit: contain` then letterboxed
the artwork inside its own box. Measured on the live page at 1280px: the frame
drew 2.5% small and 4px low, leaving a **32px black strip down the right edge**
and a shaved, misaligned bottom bevel.

`artworkImageStyle` now declares `maxWidth: none; maxHeight: none`. Re-measured
with the fix applied in the live page: the frame's bounds land on the stage at
left `0.002`, right `1279.99`, top `524.24`, bottom `720.03` — against a stage
of `0 → 1280`, `524.22 → 720`. Pixel-exact.

## 3. "It's showing my profile pic everywhere correctly except for next to the 'whats on your mind'. It's displaying my avatar and not my profile pic."

`SharedPostCreator.jsx` read `contextAvatar?.imageUrl || user?.avatar`.
`useAvatar()` is the **arena** avatar — the preset or AI-generated character a
player wears at the table — and it only falls back to the profile upload when
a player has never chosen one. So anyone who had picked a character got that
character in the composer and their real photograph everywhere else: the
header, the stories rail, the post the composer was about to publish, and the
"Posting As" chip eighteen pixels above it.

`profiles.avatar_url` now wins. The context is kept strictly as a fallback and
only when it is reporting a `profile_upload`, so a photo uploaded in this
session still paints before `user` refetches. Fixed in all three places the
component draws the personal identity, including the identity picker.

Checked and already correct, so left alone: `pages/hub/user/[username].js`
(reads `profile.avatar_url`) and `SmarterPokerStyleCard.jsx` (reads
`user?.avatar`).

## 4. "Clip the background around the edges of the footer frame" / "almost every footer ... have this same background issue"

All fourteen world artworks were **opaque RGB**. The frames are rounded
rectangles on rectangular canvases, so the corners outside the curve were
solid black squares painted onto the page.

Every one has been re-encoded as RGBA. The frame is isolated by finding, per
row and per column, the first and last run of four consecutive non-black
pixels — a *run*, not a single pixel, because these canvases carry isolated
specks a few units above black out in the margin, and taking the first lit
pixel dragged the edge dozens of pixels into the background and painted a
streak — then intersecting the two sweeps, flood-filling interior holes, and
feathering the boundary by one pixel so the curves stay anti-aliased. PNG is
lossless, so **every visible pixel is byte-identical to the approved
artwork**; only the alpha channel is new. Total growth: about 3%.

`sha256` in the registry is updated for all fourteen, which is what
`bottom-nav-clearance.test.mjs` compares the shipped bytes against.

## 5. "The footer inside the club arena is perfect ... replicate this size and placement on every footer, using this as the GOLD STANDARD"

The stages used to size themselves by `aspect-ratio` from each world's
measured frame. That produced fourteen different footer heights, all growing
without limit on a desktop. On a 1140px screen, side by side:

| | height |
|---|---|
| Club Arena (the standard) | 132px |
| Social Media | 174px |
| Training Games | 192px |
| Bankroll Manager | 183px |

At 1440px they reach 243px.

`FOOTER_ARTWORK_HEIGHT` is now `clamp(44px, 13.72vw, 132px)` — Club Arena's
`--bottom-nav-height`, copied verbatim — and the stage is a flat `width: 100%`.
The artwork is `object-fit: fill`, which is what Club Arena's image does (it
declares no `object-fit` at all): the measured frame is stretched to cover the
footer box exactly, edge to edge on both axes. `contain` would letterbox it
back inside its own aspect and reintroduce the dead strips this whole pass
exists to remove.

The trade is honest and worth naming: because the frames have fourteen
different native aspects, holding one height means each is stretched or
squashed a little to reach it — between 0.81x and 1.14x at phone widths. Club
Arena has always done exactly this to itself (1.11x at 375px) and it is the
footer Dan called perfect.

The clearance spacer reads the same constant, so content clearance,
`scroll-padding-bottom` and `--active-world-footer-height` all move together.

## Not affected

**Club Commander has no footer.** Its routes appear in neither
`world-footer-navigation.json`'s `routePrefixes` nor
`bottom-nav-routes.json`, and nothing under `pages/commander`,
`pages/hub/commander` or `src/components/commander` renders a bottom bar. The
matching Club Arena asset and CSS are fixed in that repo on
`fix/footer-frame-background`.

## Verification

- `npx tsc --noEmit` — clean.
- `node --test __tests__/bottom-nav-clearance.test.mjs
  __tests__/fixed-elements-stay-fixed.test.mjs
  __tests__/world-command-destinations.test.mjs` — 17/17.
- `e2e/global-footer-visual.spec.ts` updated in the same commit: `object-fit`
  is `fill`, the stage is full-bleed, and every viewport in the matrix asserts
  the Club Arena height token.
- The `max-width` defect and its fix were both measured against live
  production before and after, in the browser, at 1280px.
