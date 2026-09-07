# GLOBAL HEADER PROFILE FRAME LAW

**The portrait's only frame is a 0.5px black hairline. The artwork's baked
chrome ring is masked by an opaque black disc, in every header, at every
width.** Binding. Ruled by Dan four times.

Enforced by `__tests__/global-header-profile-frame-law.test.mjs` (runs in CI
through `__tests__/_test-guards-exist.test.mjs`). The identical rule in Club
Arena is `tests/the-header-portrait-frame-is-a-hairline.law.test.ts` plus the
rendered-pixel spec `tests/e2e/header-portrait-frame.spec.ts` in that repo,
recorded in its `docs/LAWS.md`.

## Dan's words

- **2026-09-07**, with a screenshot of the chrome ring showing around his
  photo: *"i need you to figure out why the global header keeps regressing
  back to this. the profile pic is supposed to be a .5 pixel black frame that
  'appears invisible' instead of this thick broken frame that exists now. once
  you fix it back, i need you to harden it, and make it regression proof."*
- **2026-09-05**: *"ITS OFF SET IN THE WORLD HUB PAGES, AND BACK TO THE THICK
  BROKEN FRAME INSTEAD OF THE THIN .5 PIXEL INVISIBLE BLACK FRAME."*
- **2026-09-03**: *"THE FRAME IN THE GLOBAL HEADER AROUND THE PROFILE IMAGE
  REGRESSED AND CHANGED (INSTEAD OF HAVING THE .50 PIXEL BLACK INVISIBLE
  CIRCLE FRAME)."*
- **2026-08-31**: remove the profile ring; thin black circular edge; 0.5px
  (Club Arena #2183, #2305, #2366; World Hub #1136, #1157).

## What the rule means

The approved header artwork (`public/images/global-header/global-header-desktop.png`,
1648 x 168) bakes a silver ring with a blue glow around a blue placeholder
silhouette where the profile picture goes. **That ring is never shown.** It is
the "thick broken frame": the live photo and the baked ring are two separate
circles that never agree to the pixel, so wherever the ring is visible it reads
as a chipped bezel around the photo.

So, in both headers this repo ships -
`src/components/ui/UniversalHeader.js` (`.approved-global-header`, every Hub
page) and the vendored
`vendor/commander-shared/src/components/commander/shared/CommanderLayout.jsx`
(`.cmd-approved-header`, Club Commander):

1. **The profile button is an opaque `#000` disc** (`border-radius: 50%`) laid
   over the whole ornament. Measured on the artwork plane the ornament is
   centred at (1159.75, 80.5); its ring spans r 40-48, its glow is gone by
   r 52, and the header's silver rails begin at r 62. The disc is centred on
   it with radius 56 (`left: 66.98%; top: 14.58%; width: 6.8%;
   aspect-ratio: 1`): 4 units past the glow, 6 units short of the rails, so it
   is black on black - invisible - at every width. Every rule that touches this
   button's background, including `:focus-visible`, bottoms out in `#000`.
2. **The avatar slot is a circle of 72% of the disc**, centred on it, and its
   border - `0.5px solid rgba(0, 0, 0, .94)` - is **the only frame the photo
   has**. Half a pixel of near-black is invisible as a border and does its job
   as an anti-alias mask on the photo's edge. It is declared in exactly one
   rule per header; overrides inherit it rather than restate it, so there is
   one copy to regress and no override can disagree with it.
3. **Nothing else draws around the photo**: no box-shadow, outline or filter
   on the button or slot; the `<img>` is borderless, round, `object-fit: cover`.
4. The button must stay **square** for the percentages to hold - the
   `.approved-global-header .approved-global-header__button { min-height: 0 }`
   reset beats the global 44px mobile touch floor and is part of the law.

The test checks the geometry by arithmetic, not by literal: move the disc until
the ring peeks out, shrink it, let it touch a rail, add a second border
declaration, or make the focus glow replace the black, and CI fails.

## How it regressed, so it is not done again

On 2026-09-01 (#1216 here, #2515 in Club Arena) the sentence "the profile
image needs to be fixed on most of them" was read as "show the ring": the disc
was removed, the photo was seated inside the ring's aperture, and
`global-header-approved.test.mjs` was rewritten to *forbid* the disc as "a shape
drawn over approved artwork". From then on every agent obeyed the tests. The
2026-09-03 fix restored the hairline and left the ring. The 2026-09-05 fix
corrected the offset (the mobile touch floor had un-squared the button) and
left the ring. Each was a real fix to a real defect, and none of them was the
one Dan was reporting, because the tests said the ring belonged there.

The "NO BOXES OVER HEADER ICONS" rule (2026-09-01) is about focus rings on the
icon buttons; the disc is the mask Dan asked for and is that rule's one
deliberate exception. **If a request about the profile image seems to call
for showing the ring, it does not - ask Dan before touching the disc.** If you
find a written rule that contradicts this one, stop and ask; do not write a
third law and do not delete either side on your own authority.
